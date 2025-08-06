// app/api/pila/fechas-corte/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerApiCredentials } from '@/lib/api-tokens';
import { calcularFechasPagoPila } from '@/lib/pila-utils';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const idSolicitud = searchParams.get('id_solicitud');

    if (!idSolicitud) {
      return NextResponse.json(
        { error: true, message: 'ID de solicitud es requerido' },
        { status: 400 }
      );
    }

    // Obtener las credenciales del servidor
    const { url, token } = getServerApiCredentials('SOLICITUD');

    if (!url || !token) {
      console.error('Credenciales de API no configuradas');
      return NextResponse.json(
        { error: true, message: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Obtener datos de la solicitud
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token,
      },
      body: JSON.stringify({ id_solicitud: idSolicitud }),
    });

    const solicitudData = await response.json();

    if (!response.ok || !solicitudData.Datos || !solicitudData.Datos.length) {
      return NextResponse.json(
        { 
          error: true, 
          message: solicitudData.mensaje || 'Error al consultar solicitud' 
        },
        { status: response.status || 500 }
      );
    }

    // Extraer los datos necesarios
    const datosSolicitud = solicitudData.Datos[0];
    const nit = datosSolicitud.NIT_CED;
    const fechaInicio = datosSolicitud.Fechainicio;
    const fechaFin = datosSolicitud.Fechafin;

    if (!nit || !fechaInicio || !fechaFin) {
      return NextResponse.json(
        { 
          error: true, 
          message: 'Datos insuficientes en la solicitud. Se requiere NIT, fecha inicio y fecha fin.' 
        },
        { status: 400 }
      );
    }

    // Cargar archivos JSON desde la carpeta pública
    let calendario = [];
    let limiteSegSocial = [];

    try {
      // Usar fetch para cargar los archivos JSON desde la carpeta pública
      const calendarioResponse = await fetch(new URL('/calendario.json', request.nextUrl.origin));
      const limiteSegSocialResponse = await fetch(new URL('/CAC_LIMITE_SEG_SOCIAL.json', request.nextUrl.origin));
      
      if (!calendarioResponse.ok || !limiteSegSocialResponse.ok) {
        throw new Error('Error al cargar archivos de configuración');
      }
      
      calendario = await calendarioResponse.json();
      limiteSegSocial = await limiteSegSocialResponse.json();
    } catch (error) {
      console.error('Error al cargar archivos JSON:', error);
      
      // Si hay un error leyendo los archivos, devolver un error
      return NextResponse.json(
        { 
          error: true, 
          message: 'Error al leer archivos de configuración' 
        },
        { status: 500 }
      );
    }

    // Calcular fechas de pago
    const fechasCorte = await calcularFechasPagoPila(
      nit,
      fechaInicio,
      fechaFin,
      calendario,
      limiteSegSocial
    );

    // Función para calcular días entre fechas
    const calcularDiasHastaFecha = (fechaStr: string): number => {
      // Parseamos la fecha en formato DD/MM/YYYY
      const [dia, mes, año] = fechaStr.split('/').map(Number);
      const fechaCorte = new Date(año, mes - 1, dia); // mes - 1 porque Date usa 0-11
      const fechaActual = new Date();
      
      // Calculamos la diferencia en milisegundos y convertimos a días
      const diferenciaMilisegundos = fechaCorte.getTime() - fechaActual.getTime();
      const diferenciaDias = Math.ceil(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
      
      return diferenciaDias;
    };

    // Actualizar los estados de las fechas basado en la fecha actual
    // (sin documentos, ya que eso se maneja en el frontend)
    const fechasConEstadoActualizado = fechasCorte.map(fecha => {
      const diasHastaFecha = calcularDiasHastaFecha(fecha.fecha);
      
      // Si está a 10 días o menos de la fecha actual, estado warning
      // Si no, estado normal (el frontend cambiará a success si hay documento)
      const estado = (diasHastaFecha <= 10 && diasHastaFecha >= 0) ? "warning" : "normal";
      
      return {
        ...fecha,
        estado: estado as "success" | "warning" | "normal"
      };
    });

    // Devolver las fechas calculadas
    return NextResponse.json({
      success: true,
      fechas: fechasConEstadoActualizado
    });

  } catch (error) {
    console.error('Error en el endpoint de fechas de corte:', error);
    return NextResponse.json(
      { 
        error: true, 
        message: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}