// lib/recaptcha.ts
/**
 * Constantes para la configuración de reCAPTCHA
 */
export const RECAPTCHA_SITE_KEY = '6LdmppsrAAAAAIATE4kJ_OIBQ8AvAAjtWPc2WCRh';
export const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '6LdmppsrAAAAAItsJ0LbGehQn7ZrD7DPVaGuc2ED';

/**
 * Interfaz para la respuesta de verificación de reCAPTCHA
 */
export interface RecaptchaVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  score?: number;
  action?: string;
  error_codes?: string[];
  'error-codes'?: string[]; // Google a veces usa este formato
}

/**
 * Verifica un token de reCAPTCHA v3 con la API de Google
 * Esta función es para uso del cliente (llama al endpoint local)
 * 
 * @param token - Token generado por reCAPTCHA en el cliente
 * @param action - Acción esperada para la verificación
 * @param minScore - Puntuación mínima aceptable (0.0 a 1.0)
 * @returns Objeto con el resultado de la verificación
 */
export async function verifyRecaptchaToken(
  token: string,
  action: string = 'login',
  minScore: number = 0.5
): Promise<{ 
  success: boolean; 
  score?: number; 
  message?: string; 
}> {
  try {
    // Hacer la petición al endpoint local que se comunicará con Google
    const response = await fetch('/api/auth/verify-recaptcha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response from verify endpoint:', errorText);
      throw new Error(`Error en la verificación de reCAPTCHA: ${response.status}`);
    }

    const data: RecaptchaVerifyResponse = await response.json();

    // Verificar la respuesta de Google
    if (!data.success) {
      console.error('reCAPTCHA verification failed:', data.error_codes || data['error-codes']);
      return { 
        success: false, 
        message: 'Verificación de reCAPTCHA fallida' 
      };
    }

    // Verificar puntuación y acción
    const score = data.score || 0;
    if (score < minScore) {
      console.warn(`reCAPTCHA score too low: ${score}`);
      return { 
        success: false, 
        score,
        message: 'La puntuación de seguridad es demasiado baja' 
      };
    }

    if (data.action && data.action !== action) {
      console.warn(`reCAPTCHA action mismatch: expected=${action}, got=${data.action}`);
      return { 
        success: false, 
        score,
        message: 'La acción de verificación no coincide' 
      };
    }

    // Todo correcto
    return { 
      success: true, 
      score 
    };
  } catch (error) {
    console.error('Error verifying reCAPTCHA token:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Error desconocido al verificar reCAPTCHA' 
    };
  }
}

/**
 * Verifica un token de reCAPTCHA directamente desde el servidor
 * Esta función debe ser llamada solo desde el servidor (API routes)
 * 
 * @param token - Token generado por reCAPTCHA en el cliente
 * @param secretKey - Clave secreta de reCAPTCHA (opcional, usa variable de entorno por defecto)
 * @returns Respuesta completa de la API de reCAPTCHA
 */
export async function verifyRecaptchaTokenServer(
  token: string,
  secretKey: string = RECAPTCHA_SECRET_KEY
): Promise<RecaptchaVerifyResponse> {
  if (!token) {
    console.error('No token provided for reCAPTCHA verification');
    return {
      success: false,
      error_codes: ['missing-token'],
    };
  }

  if (!secretKey) {
    console.error('No secret key configured for reCAPTCHA');
    return {
      success: false,
      error_codes: ['missing-secret-key'],
    };
  }

  // Construir el cuerpo de la petición con URLSearchParams
  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', token);
  
  // Agregar IP del cliente si está disponible (opcional pero recomendado)
  // En Next.js, esto se puede obtener del request en el API route
  // Por ahora lo dejamos vacío ya que esta función es genérica
  
  try {
    console.log('Calling Google reCAPTCHA API...');
    
    // Hacer la petición a la API de Google con timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout
    
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ControlAcceso/1.0',
      },
      body: formData.toString(),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Google reCAPTCHA API error: ${response.status} ${response.statusText}`);
      throw new Error(`Error en la API de reCAPTCHA: ${response.status}`);
    }

    // Procesar la respuesta
    const data: RecaptchaVerifyResponse = await response.json();
    
    // Log para debugging (sin exponer el token completo)
    console.log('reCAPTCHA API response:', {
      success: data.success,
      score: data.score,
      action: data.action,
      hostname: data.hostname,
      error_codes: data.error_codes || data['error-codes']
    });
    
    // Normalizar error_codes (Google a veces usa error-codes con guión)
    if (!data.error_codes && data['error-codes']) {
      data.error_codes = data['error-codes'];
    }
    
    return data;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('Timeout calling Google reCAPTCHA API');
      return {
        success: false,
        error_codes: ['timeout'],
      };
    }
    
    console.error('Error contacting reCAPTCHA API:', error);
    return {
      success: false,
      error_codes: ['server_error'],
    };
  }
}

/**
 * Función auxiliar para validar el formato de un token reCAPTCHA
 * 
 * @param token - Token a validar
 * @returns true si el token tiene un formato válido
 */
export function isValidRecaptchaToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Los tokens de reCAPTCHA v3 son strings largos (típicamente > 100 caracteres)
  // y contienen solo caracteres alfanuméricos, guiones y guiones bajos
  if (token.length < 20 || token.length > 2000) {
    return false;
  }
  
  // Verificar que solo contenga caracteres válidos
  const validTokenRegex = /^[A-Za-z0-9_-]+$/;
  return validTokenRegex.test(token);
}

/**
 * Función para obtener información del dominio desde el hostname
 * Útil para verificar que el token viene del dominio correcto
 * 
 * @param hostname - Hostname reportado por reCAPTCHA
 * @returns true si el hostname es válido para esta aplicación
 */
export function isValidHostname(hostname?: string): boolean {
  if (!hostname) {
    return false;
  }
  
  // Lista de hostnames válidos
  const validHostnames = [
    'localhost',
    'gacc.gecelca.com.co',
    process.env.NEXT_PUBLIC_APP_DOMAIN,
  ].filter(Boolean);
  
  // En desarrollo, aceptar localhost
  if (process.env.NODE_ENV === 'development' && hostname === 'localhost') {
    return true;
  }
  
  // En producción, verificar contra la lista de dominios válidos
  return validHostnames.some(valid => 
    hostname === valid || hostname.endsWith(`.${valid}`)
  );
}

/**
 * Configuración de reCAPTCHA para diferentes entornos
 */
export const getRecaptchaConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    siteKey: RECAPTCHA_SITE_KEY,
    secretKey: RECAPTCHA_SECRET_KEY,
    minScore: isDevelopment ? 0.3 : 0.5, // Score más bajo en desarrollo
    timeout: isDevelopment ? 10000 : 5000, // Timeout más largo en desarrollo
    actions: {
      login: 'login',
      register: 'register',
      submit: 'submit'
    }
  };
};