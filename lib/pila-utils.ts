// lib/pila-utils.ts
import type { FechaCorte } from "@/types/pila";

/**
 * Calcula las fechas de pago PILA basadas en el NIT y el período de visita
 * @param nit - NIT de la empresa
 * @param fechaInicio - Fecha de inicio de la visita
 * @param fechaFin - Fecha fin de la visita
 * @param calendario - Array de días del calendario laboral
 * @param limiteSegSocial - Array con información de días de pago según los dígitos del NIT
 * @returns Array de fechas de pago de seguridad social
 */
export async function calcularFechasPagoPila(
  nit: number | string,
  fechaInicio: string,
  fechaFin: string,
  calendario: any[],
  limiteSegSocial: any[]
): Promise<FechaCorte[]> {
  // Convertir NIT a string y obtener los últimos dos dígitos
  const nitStr = String(nit);
  const ultimosDigitos = nitStr.slice(-2);
  
  // Convertir fechas a objetos Date
  const inicioVisita = new Date(fechaInicio);
  const finVisita = new Date(fechaFin);
  
  // Buscar la información de pago correspondiente a los últimos dígitos del NIT
  const limiteSeg = limiteSegSocial.find(item => item.DIGITOS_NIT === ultimosDigitos);
  
  if (!limiteSeg) {
    throw new Error(`No se encontró información para los dígitos del NIT: ${ultimosDigitos}`);
  }
  
  // Obtener la cantidad de días hábiles requeridos para el pago
  const diasHabilesRequeridos = limiteSeg.DIAS_HABILES;
  
  // Obtener todos los primeros días de mes dentro del período
  const primerosDiasMes: Date[] = [];
  let mesActual = new Date(inicioVisita.getFullYear(), inicioVisita.getMonth(), 1);
  const mesFin = new Date(finVisita.getFullYear(), finVisita.getMonth(), 1);
  
  while (mesActual <= mesFin) {
    primerosDiasMes.push(new Date(mesActual));
    mesActual.setMonth(mesActual.getMonth() + 1);
  }
  
  // Función para determinar si un día es hábil
  const esDiaHabil = (dia: any) => {
    const titulo = dia.Título?.toUpperCase();
    const tipo = dia.TIPO?.toUpperCase();
    if (tipo === "FESTIVO") {
      return false;
    }
    if (tipo === "NORMAL" && (titulo === "SÁBADO" || titulo === "DOMINGO")) {
      return false;
    }
    return true;
  };
  
  // Función para convertir string de fecha a Date
  const parseDate = (dateStr: string): Date => {
    const parts = dateStr.split('/');
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  };
  
  // Calcular fechas de pago
  const fechasPago: FechaCorte[] = [];
  
  primerosDiasMes.forEach((primerDiaMes, index) => {
    const mesActual = primerDiaMes.getMonth() + 1;
    const anioActual = primerDiaMes.getFullYear();
    
    // Filtrar días del mes actual del calendario
    const diasMes = calendario.filter(dia => {
      const fechaDia = parseDate(dia.FECHA);
      return fechaDia >= primerDiaMes && 
             fechaDia.getMonth() === primerDiaMes.getMonth() &&
             fechaDia.getFullYear() === primerDiaMes.getFullYear();
    });
    
    // Ordenar días cronológicamente
    diasMes.sort((a, b) => parseDate(a.FECHA).getTime() - parseDate(b.FECHA).getTime());
    
    // Contar días hábiles y encontrar el día de pago
    let contadorDiasHabiles = 0;
    let diaPago = null;
    
    for (let i = 0; i < diasMes.length; i++) {
      if (esDiaHabil(diasMes[i])) {
        contadorDiasHabiles++;
        if (contadorDiasHabiles === diasHabilesRequeridos) {
          diaPago = diasMes[i];
          break;
        }
      }
    }
    
    // Si se encontró un día de pago y está dentro del período de visita, agregarlo
    if (diaPago) {
      const fechaPago = parseDate(diaPago.FECHA);
      
      if (fechaPago > inicioVisita && fechaPago <= finVisita) {
        // Formatear la fecha para mostrar
        const fechaFormateada = `${fechaPago.getDate().toString().padStart(2, '0')}/${(fechaPago.getMonth() + 1).toString().padStart(2, '0')}/${fechaPago.getFullYear()}`;
        
        // Determinar el estado de la fecha
        let estado: "success" | "warning" | "normal" = "normal";
        
        // La primera fecha cercana tiene estado warning, la más cercana success
        if (index === 0) {
          estado = "success";
        } else if (index === 1) {
          estado = "warning";
        }
        
        fechasPago.push({
          id: index + 1,
          fecha: fechaFormateada,
          estado: estado,
          mesTexto: new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(fechaPago)
        });
      }
    }
  });
  
  return fechasPago;
}

/**
 * Formatea una fecha para mostrar en la interfaz
 * @param date - Objeto Date
 * @returns Fecha formateada (DD/MM/YYYY)
 */
export function formatDate(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
}