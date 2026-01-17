# 🔒 Política de Seguridad

## 📋 Versiones Soportadas

| Versión | Soportada          |
| ------- | ------------------ |
| 1.0.x   | ✅ Sí              |
| < 1.0   | ❌ No              |

## 🚨 Reporte de Vulnerabilidades

La seguridad es nuestra máxima prioridad. Si descubres una vulnerabilidad, por favor repórtala de manera responsable.

### 📧 Proceso de Reporte

**NO** crees un issue público en GitHub para vulnerabilidades de seguridad.

En su lugar, por favor:

1. **Envíanos un correo electrónico directamente**: [security@example.com](mailto:security@example.com)
2. **Asunto**: `[SEGURIDAD] Breve descripción del problema`
3. **Incluye**:
   - Descripción detallada de la vulnerabilidad
   - Pasos para reproducirla
   - Evaluación del posible impacto
   - Sugerencia de solución (si tienes alguna)

### ⏱️ Tiempos de Respuesta

- **Respuesta inicial**: Dentro de las 24 horas
- **Triaged**: Dentro de las 48 horas  
- **Desarrollo de la solución**: 1-7 días (dependiendo de la gravedad)
- **Divulgación pública**: Después de liberar la corrección

### 🏆 Reconocimientos de Seguridad

Mantenemos un salón de la fama para divulgaciones responsables:

- *¡Tu nombre podría estar aquí!*

## 🔐 Consideraciones de Seguridad

### 🏦 Manejo de Datos Bancarios

Este proyecto maneja credenciales y datos bancarios sensibles. Principios clave de seguridad:

#### ✅ Lo que SÍ hacemos:
- Almacenamos credenciales **solo** en variables de entorno
- Implementamos **contextos de navegador aislados** por ejecución
- **Limpiamos la memoria** de datos sensibles después de su uso
- **No registramos** credenciales ni información sensible
- Usamos **solo HTTPS** para todas las comunicaciones bancarias
- Sesiones opcionales persisten en `.sessions/` con **expiración de 24h** (solo Banesco OptimizedLogin)

#### ❌ Lo que NO hacemos:
- Almacenar credenciales bancarias en el código o archivos de configuración
- Registrar información bancaria sensible
- Usar conexiones no cifradas

#### ⚠️ Session Persistence (OptimizedLogin)
- Banesco's `OptimizedLogin` feature can persist session data (cookies, localStorage) to `.sessions/` directory
- Sessions expire after 24 hours automatically
- The `.sessions/` directory is gitignored by default
- You can disable this by not using `OptimizedLogin` or manually clearing `.sessions/`

### 🛡️ Seguridad del Navegador

#### Medidas de Aislamiento: