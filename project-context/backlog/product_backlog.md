# Product Backlog completo

Fuente: `PB_Leon_Fabrizio_Lopez__Mario.pdf`

## 1. Épicas

| Épica | Historias de Usuario |
|---|---|
| Gestión de acceso y autenticación | US-01, US-02, US-03, US-04 |
| Reporte ciudadano de daño vial | US-05, US-06, US-07, US-08, US-09 |
| Visualización geoespacial de reportes | US-10, US-11, US-12 |
| Panel de gestión municipal | US-13, US-14, US-15, US-16, US-17 |
| Índice de desempeño distrital | US-18, US-19, US-20 |
| Notificaciones y seguimiento | US-21, US-22 |
| Accesibilidad y soporte | US-23, US-24, US-25 |
| Evaluación y comentarios ciudadanos | US-26, US-27 |
| Administración municipal avanzada | US-28, US-29 |
| Perfil ciudadano | US-30 |

## 2. Historias de Usuario (orden de prioridad, con Story Points)

Nota: este documento resume título + rol + objetivo de cada historia.
El detalle completo de escenarios Gherkin (Dado/Cuando/Entonces) está en
el PDF original — pégalo aquí si necesitas el detalle exacto al usar el
prompt `02_eda.toml`.

1. **US-01** Registro de cuenta ciudadana (3 pts) — Como ciudadano, quiero registrarme con correo y contraseña para reportar daños viales sin instalar app.
2. **US-02** Inicio de sesión ciudadano/municipal (2 pts) — Como usuario, quiero iniciar sesión para acceder a funcionalidades de mi rol.
3. **US-05** Crear reporte con foto, categoría y GPS (8 pts) — Como ciudadano, quiero fotografiar un daño, categorizarlo y que se registre mi GPS automáticamente.
4. **US-06** Captura offline con sincronización automática (5 pts) — Como ciudadano, quiero iniciar un reporte sin conexión y que se envíe al recuperar señal.
5. **US-10** Ver mapa interactivo con filtros (8 pts) — Como ciudadano u observador, quiero ver reportes en mapa filtrando por distrito/categoría/estado.
6. **US-13** Ver bandeja de reportes asignados al distrito (5 pts) — Como funcionario municipal, quiero ver reportes de mi distrito para gestionarlos.
7. **US-14** Actualizar el estado de un reporte (3 pts) — Como funcionario, quiero cambiar el estado (Recibido/En proceso/Resuelto/Rechazado).
8. **US-16** Notificar al ciudadano sobre cambio de estado (3 pts) — Como funcionario, quiero que el sistema notifique automáticamente al ciudadano.
9. **US-21** Recibir notificación push por cambio de estado (3 pts) — Como ciudadano, quiero recibir notificación cuando cambie el estado de mi reporte.
10. **US-07** Ver mis reportes y su estado (3 pts) — Como ciudadano, quiero ver mis reportes enviados con su estado actual.
11. **US-09** Acumular reportes sobre el mismo punto de daño (5 pts) — Como ciudadano, quiero que reportes duplicados (radio 20m, mismo tipo) se acumulen.
12. **US-11** Ver mapa de calor de deterioro por distrito (5 pts) — Como ciudadano/periodista/funcionario, quiero ver densidad de reportes.
13. **US-17** Ver dashboard de desempeño propio del distrito (pts según PDF) — Como funcionario, quiero ver estadísticas de mi distrito.
14. **US-18** Ver índice público de desempeño por distrito (5 pts) — Como ciudadano, quiero ver ranking público de desempeño distrital.
15. **US-19** Comparar tasa de resolución entre distritos — Como ciudadano/observador, quiero comparar % de resolución entre distritos.
16. **US-20** Ver tiempo promedio de atención por categoría y distrito — Como ciudadano, quiero saber cuánto tarda cada distrito por tipo de daño.
17. **US-15** Asignar responsable interno al reporte — Como funcionario, quiero asignar cuadrilla/responsable a cada reporte.
18. **US-12** Buscar reportes por distrito y categoría — Como funcionario/ciudadano, quiero filtrar por distrito, categoría y fechas.
19. **US-22** Ver historial de cambios de estado de un reporte — Como ciudadano, quiero ver el historial completo con fechas y comentarios.
20. **US-08** Editar o cancelar un reporte pendiente — Como ciudadano, quiero editar mi reporte si aún está Pendiente.
21. **US-03** Recuperar contraseña — Como usuario, quiero recuperar mi contraseña si la olvido.
22. **US-04** Cerrar sesión — Como usuario, quiero cerrar sesión de forma segura.
23. **US-23** Modo oscuro y alto contraste — Como ciudadano con necesidades de accesibilidad, quiero activar estos modos.
24. **US-24** Acceder a la guía de uso (2 pts) — Como nuevo usuario, quiero una guía interactiva dentro de la plataforma.
25. **US-26** Calificar la calidad de atención recibida (3 pts) — Como ciudadano, quiero calificar con estrellas tras la resolución.
26. **US-28** Exportar reportes del distrito a Excel/CSV (3 pts) — Como funcionario, quiero exportar reportes filtrados.
27. **US-25** Contactar soporte técnico desde la plataforma (2 pts) — Como usuario, quiero contactar soporte sin salir de la app.
28. **US-27** Comentar públicamente sobre un reporte resuelto (3 pts) — Como ciudadano, quiero confirmar si la reparación fue efectiva.
29. **US-30** Editar mi perfil y preferencias de notificación (2 pts) — Como ciudadano, quiero editar mis datos y elegir tipo de notificaciones.
30. **US-29** Configurar categorías de daño personalizadas por distrito — Como funcionario, quiero agregar categorías específicas de mi distrito.

## Reglas de negocio clave a tener presentes en el EDA

- **US-09**: acumulación de reportes duplicados dentro de un radio de 20
  metros para el mismo tipo de daño → requiere índice espacial GiST y una
  tabla de adhesión N:M entre Usuario y Reporte.
- **US-05**: asignación automática del reporte a la municipalidad distrital
  según coordenadas GPS → requiere polígonos de límites distritales y
  función de "point-in-polygon" (ST_Contains en PostGIS).
- **US-14 / US-22**: cada cambio de estado debe quedar trazado con fecha,
  autor y comentario → tabla de auditoría/historial independiente.
- **US-16 / US-21**: notificación push con fallback a email si el
  ciudadano no habilitó push → el modelo de Notificación debe soportar
  múltiples canales y un estado de entrega.
- **US-18 / US-19 / US-20**: índice de desempeño distrital es información
  pública y probablemente derivada/calculada (candidato a vista
  materializada o job periódico, no cálculo en tiempo real por request).
- **US-29**: categorías de daño no son un enum fijo — son configurables
  por distrito, con un set base de categorías estándar.
