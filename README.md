<p align="center">
  <img src="assets/icon.svg" width="76" alt="Icono de Fábula">
</p>

<h1 align="center">Fábula</h1>

<p align="center"><strong>Tus textos, con voz.</strong><br>Un estudio de narración para escuchar novelas, documentos y audiolibros.</p>

<p align="center">
  <a href="https://github.com/NixonPiguave/fabula/actions/workflows/quality.yml"><img src="https://github.com/NixonPiguave/fabula/actions/workflows/quality.yml/badge.svg" alt="Comprobaciones de calidad"></a>
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/licencia-GPL--3.0--or--later-a1ecc3" alt="Licencia GPL 3 o posterior"></a>
  <img src="https://img.shields.io/badge/plataforma-Windows%20x64-9dcaff" alt="Windows x64">
  <img src="https://img.shields.io/badge/interfaz-Espa%C3%B1ol-cfb8f5" alt="Interfaz en español">
</p>

<p align="center">
  <a href="#qué-puedes-hacer">Funciones</a> ·
  <a href="#empezar">Empezar</a> ·
  <a href="#voces-y-privacidad">Voces y privacidad</a> ·
  <a href="#documentación">Documentación</a> ·
  <a href="#colaborar">Colaborar</a>
</p>

![Estudio de narración de Fábula con un texto de demostración](docs/screenshots/studio.png)

Fábula convierte la lectura en una experiencia que puedes adaptar a tu ritmo.
Pega un texto o importa un documento, elige una voz, ajusta la narración y
escúchala en la aplicación o expórtala como MP3. Organiza capítulos y lecturas
por proyectos, guarda tus ajustes favoritos y retoma la escucha donde la dejaste.

## Qué puedes hacer

| Función                      | Para qué sirve                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Narración de textos extensos | Divide el contenido en fragmentos y capítulos para generar audio y reanudar trabajos interrumpidos. |
| Importación de documentos    | Lee PDF, TXT, Markdown, DOCX, EPUB, HTML, ODT y RTF.                                                |
| Vista previa de PDF          | Ajusta márgenes y decide si conservar encabezados, pies y números de página antes de importar.      |
| OCR opcional                 | Extrae texto en español de imágenes y documentos escaneados.                                        |
| Perfiles de voz              | Guarda voz, velocidad, tono, volumen y pausas; escucha una muestra antes de aplicarlos.             |
| Pronunciación personalizada  | Define cómo leer palabras, abreviaturas y nombres sin alterar el documento original.                |
| Biblioteca y proyectos       | Agrupa narraciones, conserva marcadores y recupera tu posición de escucha.                          |
| Exportación de audio         | Guarda el MP3 completo o los capítulos por separado.                                                |
| Voz a texto                  | Transcribe grabaciones y dictados localmente con Whisper; exporta TXT, DOCX, SRT o VTT.             |
| Apariencia personalizable    | Elige temas y paletas o ajusta los colores del estudio y el reproductor.                            |

Los límites prácticos de una narración dependen del disco, la memoria y el
proveedor de voz. Revisa el resultado al importar PDF con columnas o diseños
complejos y al utilizar reconocimiento de texto o voz.

<details>
<summary>Ver perfiles de voz y opciones de importación</summary>

![Editor y biblioteca de perfiles de voz](docs/screenshots/profiles.png)

![Vista previa y opciones para importar PDF](docs/screenshots/pdf-preview.png)

</details>

## Empezar

**Plataforma:** Windows 10/11 de 64 bits. **Idioma de la interfaz:** español.

Esta publicación ofrece el **código fuente**. El estado de las distribuciones
se documenta en [Releases](https://github.com/NixonPiguave/fabula/releases).
Los ejecutables públicos requieren completar la revisión de avisos y fuentes
de componentes nativos descrita en [Distribución](docs/DISTRIBUCION.txt).

Para ejecutar desde el código, instala **Node.js 24 o posterior** y Git:

```sh
git clone https://github.com/NixonPiguave/fabula.git
cd fabula
npm ci
npm run dev
```

`npm ci` descarga las dependencias y los runtimes necesarios para el desarrollo.
Los motores OCR, transcripción y Piper se descargan por separado desde la app
cuando los solicitas.

1. Pega un texto o selecciona **Importar**.
2. Revisa el contenido y elige una voz disponible.
3. Ajusta el ritmo o aplica uno de tus perfiles guardados.
4. Genera la narración, escúchala y exporta el audio cuando esté listo.

Las instrucciones completas están en la [guía de uso en TXT](GUIA_DE_USO.txt).

## Voces y privacidad

| Proveedor                | Procesamiento | Requisitos                                                                                         |
| ------------------------ | ------------- | -------------------------------------------------------------------------------------------------- |
| Windows SAPI             | En el equipo  | Una voz compatible instalada en Windows; detección de 32 y 64 bits.                                |
| Piper                    | En el equipo  | Motor opcional y un modelo compatible `.onnx` con su configuración y licencia.                     |
| Voces de lectura de Edge | En línea      | Internet; el texto de la narración se envía a Microsoft. Integración independiente y experimental. |

La biblioteca, borradores, preferencias y modelos se guardan en
`%APPDATA%/Fábula`. La extracción de documentos, el OCR y la transcripción se
realizan localmente. No hay cuentas de Fábula ni telemetría propia implementada.
Las descargas opcionales contactan a sus respectivos proveedores.

El acceso a las voces en línea depende de Microsoft y puede cambiar. Una
biblioteca de conexión de código abierto no concede derechos adicionales sobre
el servicio o sus voces. Cada modelo importado conserva sus propias condiciones.

Consulta [Privacidad](PRIVACIDAD.txt), [Avisos de uso](AVISOS_DE_USO.txt) y
[Componentes de terceros](TERCEROS.txt) para conocer el alcance de cada opción.

## Desarrollo

Fábula utiliza **Electron, React y TypeScript**. El proceso principal valida
las entradas; la interfaz usa aislamiento de contexto y sandbox. La narración,
importación y transcripción se procesan en workers.

```sh
npm run format:check   # Formato compartido del código
npm test                # Pruebas unitarias
npm run build          # Avisos de licencias, tipos y compilación
npm run test:profiles  # Integración de perfiles; necesita una voz SAPI local
npm run package:all    # Generación local del portable y el instalador
```

Los archivos generados, modelos descargados y datos de usuarios quedan fuera
del repositorio. El empaquetado local no publica archivos automáticamente y los
ejecutables de desarrollo no están firmados digitalmente.

## Documentación

Las guías detalladas están en texto plano para poder abrirlas con cualquier editor.

| Documento                             | Contenido                                                    |
| ------------------------------------- | ------------------------------------------------------------ |
| [Guía de uso](GUIA_DE_USO.txt)        | Importación, voces, biblioteca, transcripción y compilación. |
| [Arquitectura](docs/ARQUITECTURA.txt) | Procesos, almacenamiento y proveedores.                      |
| [Calidad](docs/CALIDAD.txt)           | Comprobaciones básicas, integración y pruebas del paquete.   |
| [Contribuciones](CONTRIBUIR.txt)      | Cómo proponer cambios y validarlos.                          |
| [Seguridad](SEGURIDAD.txt)            | Cómo comunicar una vulnerabilidad de forma privada.          |
| [Distribución](docs/DISTRIBUCION.txt) | Preparación de versiones, licencias y empaquetado.           |

## Colaborar

Puedes [reportar un problema](https://github.com/NixonPiguave/fabula/issues/new/choose),
proponer mejoras o enviar una pull request. Describe el caso de uso y acompaña
los errores con pasos reproducibles y ejemplos ficticios, evitando documentos
y grabaciones personales.

Lee la [guía de contribución](CONTRIBUIR.txt) y las
[normas de convivencia](CONVIVENCIA.txt) antes de participar. Para problemas de
seguridad utiliza el [canal privado de GitHub](https://github.com/NixonPiguave/fabula/security/advisories/new).

## Licencia

El código propio de Fábula se distribuye bajo **GPL-3.0-or-later**.
Consulta el [texto íntegro de la licencia](LICENSE.txt).

Las licencias del programa no sustituyen las condiciones de los textos, voces,
servicios o modelos que utilices. Los avisos originales de los paquetes se
conservan en [Licencias de componentes](LICENCIAS_DE_COMPONENTES.txt).

## English

Fábula is a Spanish-language desktop narration studio for Windows. Turn novels
and documents into spoken audio, organize reading projects, export MP3 files,
and transcribe recordings locally. Windows voices and imported Piper models run
on your computer; the independent Edge integration sends narration text to
Microsoft. This publication provides the source code under GPL-3.0-or-later.
