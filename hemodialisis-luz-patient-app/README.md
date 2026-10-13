# Luz Pacientes

PWA instalable para pacientes y acceso de solo lectura para familiares.

## Despliegue

1. Publique el contenido de esta carpeta por HTTPS.
2. Edite `config.js` con la URL pública HTTPS de la API; use una cadena vacía solo si un proxy publica la API en el mismo dominio.
3. Añada el dominio de la PWA a `CORS_ORIGINS` del backend.
4. Defina `PATIENT_DEFAULT_PASSWORD` con una clave temporal segura antes de crear o reiniciar pacientes.

En Android Chrome, el paciente abre la URL y selecciona **Instalar aplicación** o **Agregar a pantalla de inicio**. No se necesita Android Studio ni un APK.
