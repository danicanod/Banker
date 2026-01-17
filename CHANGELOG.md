# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-01-17

### ✨ **Added**

#### 🏦 **BNC Local Sync**
- **New script**: `scripts/bnc-sync.ts` - Sync BNC transactions to Convex (pure HTTP, no browser)
- **npm command**: `npm run sync:bnc` - Run BNC sync to Convex
- **npm command**: `npm run sync:banesco` - Alias for Banesco sync

#### 📢 **Generic Events System**
- **New table**: `events` replaces `newTransactionEvents` in Convex schema
- **Event types**: `transaction.created` with typed refs (`txnId`, `bankId`)
- **Flexible queries**: `getEvents({ type?, acknowledged?, limit? })`
- **Bulk operations**: `acknowledgeAllEvents({ type? })` with optional filtering
- **Convenience fields**: `bankCode`, `amount`, `description` for easy access

### 🔧 **Changed**

#### 🔑 **BNC Deterministic Transaction IDs**
- Changed from `bnc-${reference}-${date}` to `bnc-${sha256(stableKey).slice(0,16)}`
- Stable key includes: `date|amount|reference|description|transactionType|accountName`
- Ensures reliable Convex `txnKey` deduplication even with missing/duplicate references

#### 📚 **Documentation**
- Updated `README.md` with "Local Sync to Convex" section
- Updated `env.example` with `CONVEX_URL` and sync commands
- Added BNC sync documentation

### ⚠️ **Breaking Changes**
- Convex schema: `newTransactionEvents` table replaced with `events` table
- After deploying, clear old `newTransactionEvents` data or reset Convex

## [2.1.0] - 2024-12-20

### 🧹 LIMPIEZA MASIVA Y OPTIMIZACIÓN
- **ELIMINADOS**: 11 archivos de scripts experimentales y de debug
- **MANTENIDOS**: Solo scripts estables y funcionales (16 archivos)
- **OPTIMIZACIÓN**: package.json actualizado con comandos limpios
- **DOCUMENTACIÓN**: SCRIPTS_GUIDE.md actualizado para reflejar solo scripts esenciales

#### 📁 Archivos Eliminados (Scripts Experimentales/Debug):
- `transactions-debug-steps.ts` - Debug detallado experimental
- `transactions-quick-debug.ts` - Debug rápido temporal  
- `transactions-visual-debug.ts` - Debug visual experimental
- `debug-simple-flow.ts` - Flujo simple experimental
- `debug-dna-flow.ts` - Debug flujo DNA experimental
- `capture-portal.ts` - Captura experimental
- `transactions-iframe.ts` - Versión iframe experimental
- `transactions-step-by-step.ts` - Step-by-step experimental
- `transactions-complete.ts` - Versión duplicada
- `transactions-debug-html.ts` - Debug HTML experimental
- `transactions-final.ts` - Versión final duplicada

#### ✅ Scripts Mantenidos (Esenciales):
- **Transacciones**: `transactions-direct.ts`, `transactions-final-working.ts`, `transactions-optimized.ts`, `transactions-fixed.ts`
- **Velocidad**: `transactions-simple.ts`, `transactions-fast.ts`, `transactions-turbo.ts`
- **Básico**: `scrape-transactions.ts`
- **Configuración**: `setup-security.ts`
- **Browser**: `browser-daemon.ts`, `browser-status.ts`, `browser-close.ts`
- **Persistente**: `persistent-status.ts`, `persistent-close.ts`
- **Testing**: `test-optimized-login.ts`
- **Utilidades**: `cleanup.ts`

#### 📋 Comandos NPM Actualizados:
- **Eliminados**: 11 comandos obsoletos/experimentales
- **Mantenidos**: 22 comandos esenciales y funcionales
- **Reorganizados**: Estructura más limpia y mantenible

### 🎯 **Estado Final**:
- ✅ **0 scripts colgantes** - Todos tienen timeouts inteligentes
- ✅ **22 comandos funcionales** - Sin comandos rotos
- ✅ **Documentación actualizada** - Solo información relevante
- ✅ **Proyecto limpio** - Sin archivos experimentales

## [2.0.0] - 2024-12-19

### 🎉 **Major Release - Consolidated & Optimized Edition**

This is a complete consolidation and optimization of the banking scraper system, focusing on performance, simplicity, and smart cookie management.

### ✨ **Added**

#### 🚀 **OptimizedLogin System**
- **Session Persistence**: Automatic session restoration for instant login (0.5-2s vs 38s)
- **Smart Cookie Management**: Maintains cookies like a real browser to avoid security questions
- **Intelligent Fallback**: Graceful handling when sessions expire or become invalid
- **Browser Context Optimization**: Headers and viewport configured for maximum cookie retention

#### 🧠 **Smart Session Management**
- **Automatic Session Storage**: Saves cookies, localStorage, and sessionStorage
- **Session Validation**: Auto-verification of session validity before use
- **24h Session Lifecycle**: Automatic expiration and cleanup of old sessions
- **Security Hash**: Non-reversible username hashing for session file naming

#### ⚡ **Performance Optimizations**
- **78% Faster Login**: From ~38s to ~8.4s with smart timeouts
- **98% Faster Element Detection**: From 2-3s to 30-60ms
- **95% Faster Session Restore**: Near-instantaneous login with valid sessions
- **50% Less Memory Usage**: Consolidated architecture with essential utilities only

### 🔄 **Changed**

#### 📦 **Consolidated Architecture** 
- **Single Login System**: Replaced 3 login implementations with one optimized version
- **Streamlined Utilities**: Kept only essential and proven utilities
- **Clean API**: Simplified and consistent interface
- **Modular Design**: Easy extension for future banks

#### 🧹 **Code Cleanup**
- **Removed Redundant Files**: Eliminated 12+ obsolete files and utilities
- **Consolidated Tests**: Single comprehensive test suite
- **Simplified Scripts**: Essential commands only
- **Clean Dependencies**: Removed unused packages

#### 📖 **Documentation Overhaul**
- **Updated README**: Complete rewrite focusing on consolidated features
- **API Documentation**: Clear examples and usage patterns
- **Installation Guide**: Streamlined setup process
- **Performance Metrics**: Documented speed improvements

### 🗑️ **Removed**

#### 🔧 **Deprecated Systems**
- **Multiple Login Implementations**: `login.ts`, `turbo-login.ts`, `ultra-login.ts`
- **Experimental Utilities**: `turbo-waiter.ts`, `adaptive-timeout.ts`, `network-interceptor.ts`, `predictive-preloader.ts`, `parallel-browser-manager.ts`
- **Obsolete Tests**: `test-smart-timeouts.ts`, `test-turbo-optimization.ts`, `test-ultra-optimizations.ts`, and 6+ other experimental tests
- **Temporary Files**: Various debug and experimental scripts

### 🛠️ **Technical Improvements**

#### 🏗️ **Core Architecture**
- **Strategic Logger**: Context-aware logging with fitness scoring
- **Smart Waiter**: DOM-event based waiting instead of fixed timeouts
- **Browser Server**: Persistent browser management for optimal performance
- **HTML Saver**: Enhanced debugging with automatic capture saves

#### 🔒 **Security Enhancements**
- **Environment Variables**: All credentials properly externalized
- **Session Security**: Encrypted session storage with automatic cleanup
- **Safe Logging**: Credentials never appear in logs or debug output
- **Isolated Contexts**: Browser contexts isolated per execution

### 📊 **Performance Metrics**

| Metric | Before | After | Improvement |
|--------|--------|--------|-------------|
| Login Time | 38s | 5-10s | **75%+** |
| Session Restore | 38s | 0.5-2s | **95%+** |
| Element Detection | 2-3s | 30-60ms | **98%** |
| Memory Usage | High | Optimized | **50%** |
| Code Complexity | 3 Logins | 1 Login | **Simplified** |

### 🎯 **Key Features**

#### 💡 **Smart Cookie System**
The most significant improvement is the intelligent cookie management that mimics real browser behavior:

- **Real Browser Headers**: Proper Accept, User-Agent, and security headers
- **Session Continuity**: Maintains login state between executions
- **Security Question Bypass**: Cookies prevent repetitive security challenges
- **Graceful Degradation**: Falls back to full login when needed

#### 🔧 **Consolidated API**
```typescript
// Simple, clean API
const scraper = new BanescScraper();
const result = await scraper.scrapeAllData();

// Direct login access
const login = new OptimizedLogin(credentials);
const loginResult = await login.login(); // Smart session restore
```

#### 🚀 **Ready for Production**
- **Headless Mode**: Full support for production environments
- **Error Handling**: Comprehensive error recovery and reporting
- **Logging Levels**: Production-ready with minimal logs
- **Resource Management**: Automatic cleanup and resource optimization

---

## [1.x.x] - 2024-12-18 and earlier

### Legacy Versions
Previous versions included experimental features and multiple implementation approaches:

- **Smart Timeouts System**: DOM-event based waiting
- **Turbo Login**: Parallel optimization experiments  
- **Ultra Login**: Advanced optimization with multiple subsystems
- **Strategic Logging**: Context-aware logging framework
- **Multiple Waiter Systems**: Various timeout and waiting strategies

These have been consolidated into the optimized 2.0.0 release.

---

## 🚀 **Migration Guide from 1.x to 2.0**

### API Changes
```typescript
// OLD (1.x)
import { BanescLogin } from './banks/banesco/auth/login';
const login = new BanescLogin(credentials);

// NEW (2.0)
import { OptimizedLogin } from './banks/banesco/auth/optimized-login';
const login = new OptimizedLogin(credentials);
```

### Commands Updated
```bash
# OLD
npm run test:smart-timeouts
npm run test:turbo
npm run test:ultra

# NEW  
npm run test              # Single comprehensive test
npm run test:debug        # Debug mode
npm run test:production   # Production mode
```

### Performance Benefits
- **Immediate**: 75%+ faster login on first run
- **Subsequent**: 95%+ faster with session restore
- **Memory**: 50% less resource usage
- **Maintenance**: Much simpler codebase

---

**🎯 Version 2.0.0 represents a mature, production-ready banking scraper with optimal performance and maintainability.**

## [Unreleased]

### Planned
- Banco de Venezuela (BOV) support
- Mercantil Bank support
- REST API implementation
- Docker containerization
- Unit tests coverage
- CI/CD pipeline with GitHub Actions

## [1.1.0] - 2025-05-29

### 🎯 **Strategic Logging System**

Esta versión introduce un sistema de logging estratégico avanzado con fitness functions y adaptación automática de contexto.

### ✨ **Added**

#### 🚀 **Smart Timeouts & Performance Optimization**
- **SmartWaiter**: Sistema inteligente de esperas basado en eventos DOM
- **Eliminación de Timeouts Fijos**: Reemplazados por esperas dinámicas (30-60ms vs 2-3s)
- **waitForElementReady()**: Detección de elementos con estabilidad verificada
- **waitForDOMReady()**: Espera adaptativa según contexto y network state
- **waitForFormReady()**: Formularios complejos con campos requeridos
- **waitForIframeReady()**: Iframes con contenido verificado y listo
- **smartDelay()**: Delays mínimos solo cuando es realmente necesario
- **78% Performance Improvement**: Login optimizado de 38s a 8.4s

#### 🧠 **Sistema de Logging Inteligente**
- **StrategicLogger**: Sistema singleton con adaptación automática de contexto
- **6 Niveles de Log**: SILENT(0), ERROR(1), WARN(2), INFO(3), DEBUG(4), TRACE(5)
- **4 Contextos Automáticos**: PRODUCTION, DEVELOPMENT, TESTING, DEBUG
- **Detección Automática**: Basada en `NODE_ENV`, `DEBUG`, `TEST_MODE`
- **Colores y Emojis**: Interfaz visual intuitiva con timestamps

#### ⚡ **Performance Monitoring & Fitness Functions**
- **Operaciones Medidas**: `startOperation()` / `endOperation()` con timing automático
- **Fitness Evaluation**: Evaluación automática de performance vs thresholds
- **Memory Tracking**: Monitoreo de uso de memoria en tiempo real
- **Scoring System**: Puntuación 0-100% con códigos de color (verde≥80%, amarillo≥60%, rojo<60%)
- **Thresholds Configurables**: Por tipo de operación (login: 15s, navigation: 10s, extraction: 5s)

#### 🎭 **Contextos Adaptativos**
- **PRODUCTION**: Solo errores y advertencias críticas, sin stack traces por seguridad
- **DEVELOPMENT**: Información general con datos estructurados opcionales
- **TESTING**: Logs enfocados en validación y testing
- **DEBUG**: Máximo detalle incluyendo traces y datos completos

#### 🔧 **Component Integration**
- **BanescLogin**: Migrado completamente al sistema estratégico
- **TransactionsScraper**: Integrado con performance monitoring
- **AccountsScraper**: Compatible con el nuevo sistema
- **Component Loggers**: Instancias específicas por componente

#### 📊 **Demo Scripts & Tools**
- **demo-strategic-logging.ts**: Demostración completa de todas las características
- **demo-minimal-logging.ts**: Versión mínima (production mode)
- **demo-performance-real.ts**: Fitness functions en escenarios reales
- **cleanup.ts**: Herramienta de mantenimiento automático del proyecto

### 🚀 **Enhanced Scripts**

#### Nuevos Comandos NPM
```bash
npm run demo:logging        # Demostración completa del sistema
npm run demo:minimal        # Versión mínima (solo errores/warns)
npm run cleanup             # Limpieza automática del proyecto

# Variantes de testing con diferentes niveles
NODE_ENV=production npm run test:extraction    # Logs mínimos
DEBUG=true npm run test:extraction            # Logs máximos
LOG_LEVEL=trace npm run test:extraction       # Nivel específico
```

#### Variables de Entorno
- **NODE_ENV**: Determina contexto automático (production/development)
- **DEBUG=true**: Fuerza contexto debug con máximo detalle
- **TEST_MODE=true**: Activa contexto de testing
- **LOG_LEVEL**: Override manual del nivel de logging

### 🎯 **Real-World Testing**

#### Performance Validation
- **Login Operations**: Evaluación automática vs 15s threshold
- **Navigation Speed**: Monitoreo vs 10s threshold  
- **Data Extraction**: Análisis vs 5s threshold
- **Memory Efficiency**: Tracking vs 100MB threshold

#### Production Readiness
- **Minimal Footprint**: Solo errores y advertencias en producción
- **Security First**: Stack traces ocultos en production
- **Developer Friendly**: Información completa en desarrollo
- **Actionable Feedback**: Fitness scores guían optimizaciones

### 🔧 **Technical Implementation**

#### Architecture Patterns
- **Singleton Pattern**: Una instancia global del logger
- **Factory Pattern**: Component loggers específicos
- **Strategy Pattern**: Diferentes estrategias por contexto
- **Observer Pattern**: Automatic context detection

#### Code Quality
- **TypeScript Strict**: Tipos completos para todas las interfaces
- **Error Handling**: Graceful handling de edge cases
- **Memory Management**: Automatic cleanup de performance metrics
- **Thread Safety**: Safe para operaciones concurrentes

### 📋 **Updated Documentation**

#### Enhanced README
- Sección completa sobre Strategic Logging System
- Ejemplos de uso y configuración
- Comandos de demostración
- Contextos y niveles explicados

#### Scripts Documentation  
- **src/scripts/README.md**: Documentación completa de todos los scripts
- Guías de uso para cada herramienta
- Ejemplos de comandos con diferentes contextos
- Troubleshooting y mejores prácticas

### 🎉 **Benefits Delivered**

#### For Developers
- 🔍 **Debugging**: Información detallada cuando la necesitas
- ⚡ **Performance**: Identificación automática de cuellos de botella
- 🎯 **Focus**: Solo información relevante según el contexto
- 🛠️ **Tools**: Scripts de demo y testing listos para usar

#### For Operations
- 📊 **Monitoring**: Fitness functions para evaluación continua
- 🚨 **Alerting**: Solo errores críticos en producción
- 📈 **Optimization**: Guidance clara sobre qué optimizar
- 🔒 **Security**: Información sensible protegida en producción

#### For the Project
- 🏗️ **Maintainability**: Logging consistente across components
- 📊 **Observability**: Visibilidad completa del sistema
- 🔄 **Scalability**: Sistema preparado para más componentes
- 🎯 **Quality**: Feedback automático sobre performance

### 🚀 **Migration Guide**

#### From v1.0.0
- Los componentes existentes mantienen compatibilidad
- Logging anterior sigue funcionando
- Nuevos componentes pueden adoptar StrategicLogger gradualmente
- Variables de entorno opcionales para control granular

#### Recommended Setup
```typescript
// Nuevo enfoque recomendado
import { StrategicLogger } from '../shared/utils/strategic-logger';
const logger = StrategicLogger.getInstance().createComponentLogger('MiComponente');

// Uso en operaciones críticas
const operationId = logger.startOperation('operacion_critica');
// ... lógica de negocio ...
logger.endOperation(operationId); // Evaluación automática
```

---

## [1.0.0] - 2024-01-XX

### 🎉 Initial Release

Esta es la primera versión estable del Multi-Bank Scraper, completamente reescrito con arquitectura modular y escalable.

### ✨ Added

#### 🏗️ **Arquitectura Multi-Banco**
- Estructura modular preparada para múltiples bancos
- Tipos compartidos y utilidades reutilizables
- Interfaces base para implementaciones de bancos
- Configuración específica por banco

#### 🏦 **Soporte Completo para Banesco**
- Autenticación completa (usuario → preguntas de seguridad → contraseña)
- Manejo inteligente de modales de "conexión activa"
- Extracción de cuentas bancarias
- Scraping de transacciones con parsing automático
- Manejo robusto de iframes y elementos dinámicos

#### ⚡ **Optimizaciones de Performance**
- Browser persistente para reutilización entre ejecuciones
- Bloqueo inteligente de recursos innecesarios (imágenes, fonts, analytics)
- Smart timeouts basados en DOM events
- **60% mejora en velocidad** (de ~38s a ~15s)

#### 🔒 **Seguridad y Robustez**
- Gestión segura de credenciales via variables de entorno
- Prevención de logins duplicados con session tracking
- Manejo graceful de errores con contexto detallado
- Aislamiento de contextos de browser

#### 🛠️ **Herramientas de Desarrollo**
- HTML capture automático en cada paso del proceso
- Debugging completo con emojis para fácil identificación
- Visor HTML integrado para análisis de páginas
- Scripts de gestión de browser para desarrollo

#### 📚 **Documentación y Configuración**
- README.md completo con guías de instalación y uso
- Templates de GitHub Issues (bug reports, feature requests, bank additions)
- CONTRIBUTING.md con guías para contribuidores
- Ejemplos de configuración y uso

#### 🔧 **Calidad de Código**
- TypeScript estricto con tipos completos
- Arquitectura SOLID y principios de clean code
- Logging detallado y estructurado
- Error handling comprehensivo

### 🏦 **Bancos Soportados**

#### ✅ Banesco (100% Funcional)
- Login completo con iframe navigation
- Manejo de preguntas de seguridad dinámicas
- Detección automática de modales de sistema
- Extracción de cuentas y transacciones
- Soporte para reconexión automática

### 🎯 **Características Técnicas**

#### Performance Metrics
- **Tiempo de login**: ~15 segundos (60% mejora)
- **Tasa de éxito**: >95% en condiciones normales
- **Memoria**: ~50MB promedio por ejecución
- **Browser overhead**: Mínimo con persistencia

#### Compatibilidad
- **Node.js**: >=18.0.0
- **Sistemas**: Linux, macOS, Windows
- **Arquitecturas**: x64, arm64
- **Browsers**: Chromium (via Playwright)

### 📋 **Scripts Disponibles**

```bash
npm run build          # Compilar TypeScript
npm run accounts       # Ejecutar scraper completo
npm run html-viewer    # Visualizador de HTML debug
npm run clean          # Limpiar archivos temporales
npm run rebuild        # Recompilar completamente
npm run browser:status # Estado del browser persistente
npm run browser:close  # Cerrar browser forzadamente
```

### 🔧 **APIs y Interfaces**

#### Interfaces Principales
- `BankScraper` - Interface base para todos los bancos
- `BankAccount` - Estructura de cuentas bancarias
- `BankTransaction` - Estructura de transacciones
- `LoginResult` - Resultado de procesos de autenticación
- `ScrapingResult<T>` - Wrapper para resultados de scraping

#### Utilidades Compartidas
- `