<#
  Prepara los datos de calles de Perú para OSRM.

    powershell -ExecutionPolicy Bypass -File scripts/preparar-osrm.ps1

  Descarga el mapa de Perú de Geofabrik (~300 MB) y lo convierte en el grafo que
  OSRM necesita para calcular rutas por carretera. Se hace UNA sola vez; después
  basta con `docker compose -f docker-compose.rutas.yml up -d`.

  Avisos importantes:

   - Tarda bastante (el preprocesado, varios minutos) y **necesita unos 8 GB de
     RAM libres**. Con menos, el proceso se queda sin memoria.
   - Los archivos resultantes ocupan del orden de 1-2 GB.
   - Si prefieres otra región, cambia la URL: en https://download.geofabrik.de
     están todos los países.
#>

$ErrorActionPreference = 'Stop'

$carpeta = Join-Path (Get-Location) 'datos-osrm'
$archivo = 'peru-latest.osm.pbf'
$url = "https://download.geofabrik.de/south-america/$archivo"
$rutaPbf = Join-Path $carpeta $archivo

Write-Host ''
Write-Host '  Preparación de datos de OSRM para Perú' -ForegroundColor Cyan
Write-Host '  ======================================' -ForegroundColor Cyan
Write-Host ''

# ── Comprobaciones previas ────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host '  ERROR: Docker no está instalado o no está en el PATH.' -ForegroundColor Red
  Write-Host '  Instala Docker Desktop: https://www.docker.com/products/docker-desktop/' -ForegroundColor Red
  exit 1
}

docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host '  ERROR: Docker está instalado pero no responde. ¿Está Docker Desktop arrancado?' -ForegroundColor Red
  exit 1
}

$ramGb = [math]::Round((Get-CimInstance Win32_OperatingSystem).TotalPhysicalMemory / 1GB, 1)
Write-Host "  Memoria del equipo: $ramGb GB"
if ($ramGb -lt 8) {
  Write-Host '  AVISO: se recomiendan 8 GB o más. El preprocesado podría fallar.' -ForegroundColor Yellow
  Write-Host '         Si falla, hay alternativas: usar un extracto más pequeño o' -ForegroundColor Yellow
  Write-Host '         hacer la preparación en otro equipo y copiar la carpeta.' -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
Write-Host "  Carpeta de datos: $carpeta"
Write-Host ''

# ── 1. Descargar el mapa ──────────────────────────────────────────────────
if (Test-Path $rutaPbf) {
  $tam = [math]::Round((Get-Item $rutaPbf).Length / 1MB, 0)
  Write-Host "  [1/3] El mapa ya está descargado ($tam MB). Se omite la descarga." -ForegroundColor Green
} else {
  Write-Host '  [1/3] Descargando el mapa de Perú (~300 MB). Puede tardar varios minutos…'
  # curl.exe viene con Windows 10+ y es mucho más rápido que Invoke-WebRequest.
  & curl.exe -L --fail --progress-bar -o $rutaPbf $url
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: falló la descarga.' -ForegroundColor Red
    exit 1
  }
  $tam = [math]::Round((Get-Item $rutaPbf).Length / 1MB, 0)
  Write-Host "  Descargado: $tam MB" -ForegroundColor Green
}
Write-Host ''

# ── 2. Preprocesar ────────────────────────────────────────────────────────
function Invoke-Osrm {
  param([string[]]$Argumentos, [string]$Descripcion)
  Write-Host "  $Descripcion"
  & docker run --rm -t -v "${carpeta}:/data" osrm/osrm-backend @Argumentos
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR en: $Descripcion" -ForegroundColor Red
    exit 1
  }
}

Write-Host '  [2/3] Preprocesando el grafo (esto es lo que tarda)…' -ForegroundColor Yellow
Invoke-Osrm -Argumentos @('osrm-extract', '-p', '/opt/car.lua', "/data/$archivo") `
  -Descripcion 'Extrayendo la red de calles…'
Invoke-Osrm -Argumentos @('osrm-partition', "/data/peru-latest.osrm") `
  -Descripcion 'Particionando para búsquedas rápidas…'
Invoke-Osrm -Argumentos @('osrm-customize', "/data/peru-latest.osrm") `
  -Descripcion 'Aplicando los pesos de tráfico…'
Write-Host '  Grafo preparado.' -ForegroundColor Green
Write-Host ''

# ── 3. Resumen ────────────────────────────────────────────────────────────
$peso = [math]::Round(((Get-ChildItem $carpeta -Recurse -File | Measure-Object Length -Sum).Sum) / 1GB, 2)
Write-Host '  [3/3] Listo.' -ForegroundColor Green
Write-Host "  Archivos generados: $peso GB en $carpeta"
Write-Host ''
Write-Host '  Para arrancar los servicios:' -ForegroundColor Cyan
Write-Host '    docker compose -f docker-compose.rutas.yml up -d'
Write-Host ''
Write-Host '  Y para que la aplicación los use, añade esta variable y reiníciala:' -ForegroundColor Cyan
Write-Host '    $env:VROOM_URL = "http://localhost:3001"'
Write-Host ''
