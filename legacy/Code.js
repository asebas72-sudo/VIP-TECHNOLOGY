/**
 * =========================================================
 *  SERVICIO TÉCNICO - Backend (Code.gs)
 *  Versión con soporte de múltiples fotos por reparación
 *  + Código único con componente de fecha/hora
 *  + Módulo de ASESORÍAS (con Fecha y Hora de Visita agendable
 *    posteriormente desde el dashboard)
 *  + Técnico Asignado en Asesorías
 *  + Celular del técnico (para notificar por WhatsApp)
 * =========================================================
 */
var CONFIG = {
  SPREADSHEET_URL    : 'https://docs.google.com/spreadsheets/d/1cvpwRkhd3Dw0QguWbFIVqQlR89KFPCS45X11tM3aISU/edit?usp=sharing',
  SHEET_INGRESOS     : 'Ingresos',
  SHEET_REPARACIONES : 'Reparaciones',
  SHEET_MARCAS       : 'Marca',
  SHEET_CLIENTES     : 'Clientes',
  SHEET_ASESORIAS    : 'Asesoria',
  SHEET_USUARIOS     : 'Usuarios',
  DRIVE_FOLDER_NAME  : 'EvidenciasServicioTecnico',
  DIAS_ENTREGA       : 8,
  MAX_FOTOS          : 5,
  SESSION_TTL_SECONDS: 21600   // 6 horas
};

/* =========================================================
 *  ENRUTAMIENTO / RENDER
 * ========================================================= */

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('VIP TECHNOLOGY')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getPageContent(page) {
  var map = {
    ingresos     : 'IngresosDashboard',
    ingresoForm  : 'IngresosForm',
    reparaciones : 'ReparacionesDashboard',
    asesorias    : 'AsesoriasDashboard',
    asesoriaForm : 'AsesoriasForm',
    marcas       : 'Proximamente'
  };
  var file = map[page];
  if (!file) throw new Error('Página no encontrada: ' + page);
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

/* =========================================================
 *  HELPERS DE HOJA DE CÁLCULO
 * ========================================================= */

function ss_() {
  if (!CONFIG.SPREADSHEET_URL || CONFIG.SPREADSHEET_URL.indexOf('PEGA_AQUI') > -1) {
    throw new Error('Falta configurar CONFIG.SPREADSHEET_URL en Code.gs con la URL real de tu Google Sheet.');
  }
  return SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
}

function getSheet_(name) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet) {
    var disponibles = ss_().getSheets().map(function (s) { return s.getName(); }).join(', ');
    throw new Error('No se encontró la hoja "' + name + '". Hojas disponibles: ' + disponibles);
  }
  return sheet;
}

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  return data.slice(1)
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function appendObjectRow_(sheet, dataObj) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (h) {
    return (dataObj[h] !== undefined && dataObj[h] !== null) ? dataObj[h] : '';
  });
  sheet.appendRow(row);
  return row;
}

function getNextId_(sheet, idHeaderName) {
  var headers = getHeaders_(sheet);
  var idx = headers.indexOf(idHeaderName);
  if (idx === -1) return 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var values = sheet.getRange(2, idx + 1, lastRow - 1, 1).getValues();
  var max = 0;
  values.forEach(function (v) {
    var n = parseInt(v[0], 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function findKeyLike_(obj, regex) {
  var key = Object.keys(obj).filter(function (k) { return regex.test(k); })[0];
  return key ? obj[key] : '';
}

/* =========================================================
 *  HELPER GENÉRICO — actualizar fila por columna clave
 *  (funciona para "Codigo" en Ingresos/Reparaciones o para
 *   "IdIngreso" en Asesorias, o cualquier otra columna única)
 * ========================================================= */

function actualizarFilaPorCampo_(sheet, nombreColumnaClave, valorClave, mapeoCampos) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  var headers        = data[0].map(function (h) { return String(h).trim(); });
  var colIdxClave    = headers.indexOf(nombreColumnaClave);
  if (colIdxClave === -1) {
    throw new Error("No se encontró la columna '" + nombreColumnaClave + "' en la hoja '" + sheet.getName() + "'.");
  }
  var filaDestino = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIdxClave]).trim() === String(valorClave).trim()) {
      filaDestino = i + 1;
      break;
    }
  }
  if (filaDestino === -1) return false;
  for (var propiedad in mapeoCampos) {
    var colIdx = headers.indexOf(propiedad);
    if (colIdx > -1) sheet.getRange(filaDestino, colIdx + 1).setValue(mapeoCampos[propiedad]);
  }
  return true;
}

// Mantiene compatibilidad con el código existente (Ingresos / Reparaciones,
// que identifican la fila por la columna "Codigo").
function actualizarFilaPorCodigo_(sheet, codigo, mapeoCampos) {
  return actualizarFilaPorCampo_(sheet, 'Codigo', codigo, mapeoCampos);
}

/* =========================================================
 *  ARCHIVOS EN DRIVE  (firma / foto / fotos adicionales)
 * ========================================================= */

function getOrCreateFolder_() {
  var folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
}

function saveBase64File_(base64Data, fileName, mimeType) {
  if (!base64Data) return '';
  var commaIdx   = base64Data.indexOf(',');
  var pureBase64 = commaIdx > -1 ? base64Data.substring(commaIdx + 1) : base64Data;
  var bytes  = Utilities.base64Decode(pureBase64);
  var blob   = Utilities.newBlob(bytes, mimeType, fileName);
  var folder = getOrCreateFolder_();
  var file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return normalizeDriveUrl_(file.getId());
}

function normalizeDriveUrl_(value) {
  if (!value) return '';
  value = String(value).trim();
  if (value.indexOf('http') === 0) {
    var m = value.match(/[-\w]{25,}/);
    return m ? 'https://drive.google.com/uc?export=view&id=' + m[0] : value;
  }
  return 'https://drive.google.com/uc?export=view&id=' + value;
}

/**
 * Sube un array de strings base64 a Drive y devuelve un array de URLs públicas.
 * Se usa para las fotos del técnico en el panel de reparaciones.
 *
 * @param {string[]} fotosBase64  Array de data-URLs (data:image/...;base64,...)
 * @param {string}   codigo       Código del ticket (usado en el nombre del archivo)
 * @param {number}   offsetIdx    Índice de inicio para numerar los archivos (0 por defecto)
 * @returns {string[]}            Array de URLs públicas de Drive
 */
function subirFotosADrive_(fotosBase64, codigo, offsetIdx) {
  if (!fotosBase64 || fotosBase64.length === 0) return [];
  offsetIdx = offsetIdx || 0;
  var urls = [];
  fotosBase64.forEach(function (b64, i) {
    if (!b64) { urls.push(''); return; }
    // Detectar mime type desde el data-URL (image/jpeg, image/png, image/webp, …)
    var mimeMatch = b64.match(/^data:(image\/[\w+.-]+);base64,/);
    var mimeType  = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    var ext       = mimeType.split('/')[1].replace('jpeg', 'jpg');
    var fileName  = 'Foto_' + codigo + '_' + (offsetIdx + i + 1) + '.' + ext;
    try {
      urls.push(saveBase64File_(b64, fileName, mimeType));
    } catch (e) {
      console.error('Error al subir foto ' + fileName + ': ' + e.message);
      urls.push('');
    }
  });
  return urls;
}

/* =========================================================
 *  CLIENTES — guardar o actualizar por cédula
 * =========================================================
 *  La hoja "Clientes" debe tener estos encabezados:
 *    Cedula | Nombre | Correo | Celular | UltimaVisita
 * ========================================================= */

function upsertCliente_(cedula, nombre, correo, celular) {
  try {
    var sheet   = getSheet_(CONFIG.SHEET_CLIENTES);
    var data    = sheet.getDataRange().getValues();
    var headers = data[0].map(function (h) { return String(h).trim(); });

    var iCedula       = headers.indexOf('Cedula');
    var iNombre       = headers.indexOf('Nombre');
    var iCorreo       = headers.indexOf('Correo');
    var iCelular      = headers.indexOf('Celular');
    var iUltimaVisita = headers.indexOf('UltimaVisita');

    if (iCedula === -1) throw new Error("No se encontró la columna 'Cedula' en la hoja Clientes.");

    var hoy = new Date();
    var filaExist = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][iCedula]).trim() === String(cedula).trim()) {
        filaExist = i + 1;
        break;
      }
    }

    if (filaExist === -1) {
      appendObjectRow_(sheet, {
        Cedula      : cedula,
        Nombre      : nombre,
        Correo      : correo,
        Celular     : celular,
        UltimaVisita: hoy
      });
    } else {
      if (iNombre       > -1) sheet.getRange(filaExist, iNombre       + 1).setValue(nombre);
      if (iCorreo       > -1) sheet.getRange(filaExist, iCorreo       + 1).setValue(correo);
      if (iCelular      > -1) sheet.getRange(filaExist, iCelular      + 1).setValue(celular);
      if (iUltimaVisita > -1) sheet.getRange(filaExist, iUltimaVisita + 1).setValue(hoy);
    }
  } catch (err) {
    console.error('upsertCliente_ error: ' + err.message);
  }
}

/* =========================================================
 *  BUSCAR CLIENTE POR CÉDULA
 * ========================================================= */

function buscarClientePorCedula(cedula) {
  try {
    if (!cedula) return null;
    var sheet   = getSheet_(CONFIG.SHEET_CLIENTES);
    var data    = sheet.getDataRange().getValues();
    if (data.length < 2) return null;

    var headers  = data[0].map(function (h) { return String(h).trim(); });
    var iCedula  = headers.indexOf('Cedula');
    var iNombre  = headers.indexOf('Nombre');
    var iCorreo  = headers.indexOf('Correo');
    var iCelular = headers.indexOf('Celular');

    if (iCedula === -1) return null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][iCedula]).trim() === String(cedula).trim()) {
        return {
          nombre : iNombre  > -1 ? String(data[i][iNombre])  : '',
          correo : iCorreo  > -1 ? String(data[i][iCorreo])  : '',
          celular: iCelular > -1 ? String(data[i][iCelular]) : ''
        };
      }
    }
    return null;
  } catch (err) {
    console.error('buscarClientePorCedula error: ' + err.message);
    return null;
  }
}

/* =========================================================
 *  MARCAS COMPUTADOR
 * ========================================================= */

function getMarcas() {
  var sheet = getSheet_(CONFIG.SHEET_MARCAS);
  var rows  = sheetToObjects_(sheet);
  return rows
    .map(function (r) {
      return {
        id    : findKeyLike_(r, /^idmarca$/i) || findKeyLike_(r, /id/i),
        nombre: findKeyLike_(r, /^marca$/i),
        logo  : normalizeDriveUrl_(findKeyLike_(r, /logo|imagen/i))
      };
    })
    .filter(function (m) { return m.nombre; });
}

/* =========================================================
 *  TÉCNICOS (para asignar en Asesorías / Reparaciones)
 *  ─────────────────────────────────────────────────────────
 *  Lee la hoja "Usuarios" y devuelve el nombre de todas las
 *  personas cuyo Rol sea "Tecnico" (case-insensitive).
 * ========================================================= */

function getTecnicos() {
  try {
    var sheet = getSheet_(CONFIG.SHEET_USUARIOS);
    var rows  = sheetToObjects_(sheet);
    return rows
      .filter(function (r) {
        return String(r.Rol || '').trim().toLowerCase() === 'tecnico';
      })
      .map(function (r) {
        return String(r.Nombre || r.Usuario || '').trim();
      })
      .filter(function (n) { return n; });
  } catch (err) {
    console.error('getTecnicos error: ' + err.message);
    return [];
  }
}

/* =========================================================
 *  TÉCNICOS CON CELULAR (para el botón de WhatsApp en Asesorías)
 *  ─────────────────────────────────────────────────────────
 *  Igual que getTecnicos(), pero además devuelve el Celular
 *  de cada técnico (hoja "Usuarios", columna "Celular"),
 *  filtrando solo filas cuyo Rol sea "Tecnico". El frontend
 *  usa esto para mostrar el ícono de WhatsApp junto al campo
 *  "Técnico Asignado" en el modal de Asesorías.
 * ========================================================= */

function getTecnicosConCelular() {
  try {
    var sheet = getSheet_(CONFIG.SHEET_USUARIOS);
    var rows  = sheetToObjects_(sheet);
    return rows
      .filter(function (r) {
        return String(r.Rol || '').trim().toLowerCase() === 'tecnico';
      })
      .map(function (r) {
        return {
          Nombre : String(r.Nombre || r.Usuario || '').trim(),
          Celular: String(r.Celular || '').trim()
        };
      })
      .filter(function (t) { return t.Nombre && t.Celular; });
  } catch (err) {
    console.error('getTecnicosConCelular error: ' + err.message);
    return [];
  }
}

/* =========================================================
 *  CÓDIGO ÚNICO DEL EQUIPO
 * ========================================================= *
 *  Estructura del código:
 *
 *    [DD] + [2 letras nombre] + [2 dígitos cédula] +
 *    [2 letras nombre] + [2 dígitos cédula] +
 *    [1 letra marca] + [HHmmss]
 *
 *  - DD (día del mes) al inicio.
 *  - HHmmss (hora, minuto, segundo) al final.
 *
 *  Esto garantiza que, aunque dos clientes tengan nombre,
 *  cédula y marca "parecidos", el código nunca se repita,
 *  salvo que dos registros se guarden en el mismo segundo
 *  exacto (prácticamente imposible en un flujo manual).
 * ========================================================= */

function buildCodigo_(cedula, nombre, marca, fecha) {
  fecha = fecha || new Date();
  var tz = Session.getScriptTimeZone();

  var ced = String(cedula || '').replace(/\D/g, '');
  var primerNombre = String(nombre || '').trim().split(/\s+/)[0] || '';
  var nom = primerNombre.toUpperCase().substring(0, 4);
  var mar = String(marca || '').replace(/\s+/g, '').toUpperCase();

  var parte1_nom = nom.substring(0, 2);
  var parte2_ced = ced.substring(0, 2);
  var parte3_nom = nom.substring(2, 4);
  var parte4_ced = ced.slice(-2);
  var parte5_mar = mar.substring(0, 1);

  // Componente de fecha/hora para garantizar unicidad
  var diaStr  = Utilities.formatDate(fecha, tz, 'dd');      // 2 dígitos: día del mes
  var horaStr = Utilities.formatDate(fecha, tz, 'HHmmss');  // 6 dígitos: hora-min-seg

  return diaStr + parte1_nom + parte2_ced + parte3_nom + parte4_ced + parte5_mar + horaStr;
}

/* =========================================================
 *  NOTIFICACIONES POR CORREO — INGRESOS
 * ========================================================= */

function construirTablaTicketHTML_(ticket) {
  var filaImagen = '';
  if (ticket.imagenUrl) {
    filaImagen =
      '<tr>' +
        '<td colspan="2" style="padding:14px 16px; text-align:center; background:#ffffff;">' +
          '<img src="' + ticket.imagenUrl + '" width="220" style="max-width:100%; border-radius:8px; border:1px solid #e2e8f0;" alt="Foto del equipo">' +
        '</td>' +
      '</tr>';
  }
  function fila(label, valor) {
    return '<tr>' +
      '<td style="padding:10px 16px; background:#eef1f6; border-bottom:1px solid #e2e8f0; font-family:Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.04em; color:#475569; width:140px;">' + label + '</td>' +
      '<td style="padding:10px 16px; background:#ffffff; border-bottom:1px solid #e2e8f0; font-family:Arial,sans-serif; font-size:14px; font-weight:600; color:#0f172a;">' + (valor || '—') + '</td>' +
    '</tr>';
  }
  return '<table cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:420px; border-collapse:collapse; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; font-family:Arial,sans-serif;">' +
    '<tr><td colspan="2" style="background:#7e22ce; padding:14px 16px; font-family:Arial,sans-serif;">' +
      '<span style="color:#ffffff; font-size:15px; font-weight:bold;">VIP TECHNOLOGY · Ficha de ingreso</span>' +
    '</td></tr>' +
    fila('Código',  '<span style="font-family:monospace; font-weight:bold; color:#7e22ce;">' + (ticket.codigo || '—') + '</span>') +
    fila('Cliente', ticket.nombre) +
    fila('Equipo',  ticket.equipo) +
    fila('Fecha de ingreso', ticket.fechaIngreso) +
    filaImagen +
  '</table>';
}

function enviarNotificacionVIP(ticket) {
  var correo = ticket && ticket.correo;
  var codigo = ticket && ticket.codigo;
  if (!correo) return 'Error: Correo vacío';

  var asunto = 'VIPTECHNOLOGY - NOTIFICACION';
  var cuerpoTextoPlano =
    'Hola,\n\nHas recibido una nueva notificación de VIPTECHNOLOGY.\n\n' +
    'TU COMPUTADOR ESTA EN ESTADO: INGRESADO\n\n' +
    'Código: ' + codigo + '\nCliente: ' + ticket.nombre +
    '\nEquipo: ' + ticket.equipo + '\nFecha de ingreso: ' + ticket.fechaIngreso + '\n';

  var tablaHTML  = construirTablaTicketHTML_(ticket);
  var cuerpoHTML =
    'Hola,<br><br>Has recibido una nueva notificación de VIPTECHNOLOGY.<br><br>' +
    'TU COMPUTADOR ESTA EN ESTADO: <b>INGRESADO</b><br><br>' + tablaHTML + '<br>' +
    '<b>TE RECORDAMOS:</b><br><br>' +
    '* Toda revisión cuesta <b>$20.000 MIL PESOS</b> siempre y cuando no desee arreglar el equipo tecnológico.<br><br>' +
    '* Presentar código enviado a su Email - WhatsApp al momento de reclamarlo.<br><br>' +
    '<b>CODIGO: ' + codigo + '</b><br><br>' +
    '<b>IMPORTANTE:</b><br><br>' +
    'Tener presente que el equipo debe ser reclamado en un tiempo inferior a 30 días. Pasado este tiempo se cobrará por día un valor de <b>$1000 MIL PESOS</b> por concepto de bodegaje y no se responde por él.<br><br>' +
    '<b>¡¡PRONTO RECIBIRAS AVANCES SOBRE TU EQUIPO TECNOLOGICO!!</b>';

  GmailApp.sendEmail(correo, asunto, cuerpoTextoPlano, { htmlBody: cuerpoHTML });
  return 'Correo enviado a: ' + correo;
}

function enviarCorreoReparacionBackend(datos) {
  try {
    if (!datos || !datos.destinatario) throw new Error('No se proporcionó un correo destinatario.');
    var asunto      = datos.asunto || 'Actualización de su reparación';
    var cuerpoTexto = datos.cuerpo || '';
    var cuerpoHTML  =
      '<div style="font-family:Arial,sans-serif; max-width:480px;">' +
        '<table cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden;">' +
          '<tr><td style="background:#7e22ce; padding:14px 16px;">' +
            '<span style="color:#ffffff; font-size:15px; font-weight:bold;">VIP TECHNOLOGY · Actualización de su equipo</span>' +
          '</td></tr>' +
          '<tr><td style="padding:18px 16px; background:#ffffff; font-size:14px; color:#0f172a; line-height:1.5;">' +
            cuerpoTexto.replace(/\n/g, '<br>') +
          '</td></tr>' +
        '</table>' +
      '</div>';
    GmailApp.sendEmail(datos.destinatario, asunto, cuerpoTexto, { htmlBody: cuerpoHTML });
    return { ok: true };
  } catch (err) {
    console.error('Error al enviar correo de reparación: ' + err.message);
    return { ok: false, error: err.message };
  }
}

/* =========================================================
 *  NOTIFICACIONES POR CORREO — ASESORÍAS
 * ========================================================= */

function construirTablaAsesoriaHTML_(a) {
  function fila(label, valor) {
    return '<tr>' +
      '<td style="padding:10px 16px; background:#eef1f6; border-bottom:1px solid #e2e8f0; font-family:Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.04em; color:#475569; width:140px;">' + label + '</td>' +
      '<td style="padding:10px 16px; background:#ffffff; border-bottom:1px solid #e2e8f0; font-family:Arial,sans-serif; font-size:14px; font-weight:600; color:#0f172a;">' + (valor || '—') + '</td>' +
    '</tr>';
  }
  return '<table cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:420px; border-collapse:collapse; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; font-family:Arial,sans-serif;">' +
    '<tr><td colspan="2" style="background:#7e22ce; padding:14px 16px;">' +
      '<span style="color:#ffffff; font-size:15px; font-weight:bold;">VIP TECHNOLOGY · Solicitud de asesoría</span>' +
    '</td></tr>' +
    fila('ID',        '<span style="font-family:monospace; font-weight:bold; color:#7e22ce;">#' + (a.idAsesoria || '—') + '</span>') +
    fila('Cliente',   a.nombre) +
    fila('Solicitud', a.solicitud) +
    fila('Fecha de solicitud', a.fechaIngreso) +
  '</table>';
}

function enviarNotificacionAsesoria(a) {
  var correo = a && a.correo;
  if (!correo) return 'Error: Correo vacío';

  var asunto = 'VIPTECHNOLOGY - ASESORÍA AGENDADA';
  var cuerpoTextoPlano =
    'Hola,\n\nTu solicitud de asesoría en VIPTECHNOLOGY fue registrada.\n\n' +
    'ID: ' + a.idAsesoria + '\nCliente: ' + a.nombre +
    '\nSolicitud: ' + a.solicitud + '\n';

  var tablaHTML  = construirTablaAsesoriaHTML_(a);
  var cuerpoHTML =
    'Hola,<br><br>Tu solicitud de asesoría en VIPTECHNOLOGY fue registrada.<br><br>' +
    tablaHTML + '<br>' +
    '<b>Pronto confirmaremos contigo los detalles de la visita.</b>';

  GmailApp.sendEmail(correo, asunto, cuerpoTextoPlano, { htmlBody: cuerpoHTML });
  return 'Correo enviado a: ' + correo;
}

/* =========================================================
 *  LECTURA DE INGRESOS
 * ========================================================= */

function getIngresos(token) {
  var sesion = requerirSesion_(token);

  var sheet   = getSheet_(CONFIG.SHEET_INGRESOS);
  var data    = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var tz      = Session.getScriptTimeZone();

  var rows = data.slice(1)
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        var v = row[i];
        obj[h] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'dd/MM/yyyy') : v;
      });
      return obj;
    })
    .reverse();

  if (!esAdmin_(sesion)) {
    var miNombre = String(sesion.nombre || '').trim().toLowerCase();
    rows = rows.filter(function (r) {
      return String(r.TecnicoAsignado || '').trim().toLowerCase() === miNombre;
    });
  }

  return rows;
}

/* =========================================================
 *  LECTURA DE REPARACIONES
 *  Incluye Foto1…Foto5 (columnas nuevas) y Imagen (legacy)
 * ========================================================= */

function getReparacionesBackend(token) {
  var sesion = requerirSesion_(token);

  var sheet = getSheet_(CONFIG.SHEET_REPARACIONES);
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var tz      = Session.getScriptTimeZone();

  var rows = data.slice(1)
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        var v = row[i];
        obj[h] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'dd/MM/yyyy') : v;
      });
      return obj;
    })
    .reverse();

  if (!esAdmin_(sesion)) {
    var miNombre = String(sesion.nombre || '').trim().toLowerCase();
    rows = rows.filter(function (r) {
      return String(r.TecnicoAsignado || '').trim().toLowerCase() === miNombre;
    });
  }

  return rows;
}

/* =========================================================
 *  LECTURA DE ASESORÍAS
 *  NOTA: "FechaVisita" se formatea con HORA (dd/MM/yyyy HH:mm)
 *  porque el modal del dashboard usa <input type="datetime-local">.
 *  El resto de columnas de fecha se formatean solo con día (dd/MM/yyyy).
 *  "TecnicoAsignado" se lee tal cual (texto simple), sin
 *  necesidad de tratamiento especial: se incluye automáticamente
 *  en el objeto porque el mapeo es genérico por encabezados.
 * ========================================================= */

function getAsesorias(token) {
  var sesion = requerirSesion_(token);

  var sheet   = getSheet_(CONFIG.SHEET_ASESORIAS);
  var data    = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var tz      = Session.getScriptTimeZone();

  var rows = data.slice(1)
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        var v = row[i];
        if (v instanceof Date) {
          obj[h] = (h === 'FechaVisita')
            ? Utilities.formatDate(v, tz, 'dd/MM/yyyy HH:mm')
            : Utilities.formatDate(v, tz, 'dd/MM/yyyy');
        } else {
          obj[h] = v;
        }
      });
      return obj;
    })
    .reverse();

  if (!esAdmin_(sesion)) {
    var miNombre = String(sesion.nombre || '').trim().toLowerCase();
    rows = rows.filter(function (r) {
      return String(r.TecnicoAsignado || '').trim().toLowerCase() === miNombre;
    });
  }

  return rows;
}

/* =========================================================
 *  ACTUALIZAR FICHA TÉCNICA (REPARACIONES)
 *  ─────────────────────────────────────────────────────────
 *  El payload del frontend incluye ahora:
 *    payload.fotosExistentes   → string[] de URLs ya guardadas
 *                                que el técnico NO eliminó
 *    payload.fotosNuevasBase64 → string[] de data-URLs nuevas
 *                                que hay que subir a Drive
 *
 *  La hoja "Reparaciones" debe tener columnas:
 *    Foto1 | Foto2 | Foto3 | Foto4 | Foto5
 *  (además de las ya existentes)
 * ========================================================= */

function updateReparacionBackend(payload) {
  try {
    if (!payload || !payload.codigo) throw new Error('Código de ticket no proporcionado.');

    var sesion = requerirSesion_(payload.token);
    var sheet  = getSheet_(CONFIG.SHEET_REPARACIONES);

    // ── Bloqueo: un técnico no-admin solo puede editar sus propios tickets ──
    // (o tickets aún sin técnico asignado, para poder tomarlos)
    if (!esAdmin_(sesion)) {
      var dataActual    = sheet.getDataRange().getValues();
      var headersActual = dataActual[0].map(function (h) { return String(h).trim(); });
      var iCodigo       = headersActual.indexOf('Codigo');
      var iTecnico      = headersActual.indexOf('TecnicoAsignado');
      var miNombre      = String(sesion.nombre || '').trim().toLowerCase();

      for (var i = 1; i < dataActual.length; i++) {
        if (String(dataActual[i][iCodigo]).trim() === String(payload.codigo).trim()) {
          var tecnicoActual = String(dataActual[i][iTecnico] || '').trim().toLowerCase();
          if (tecnicoActual && tecnicoActual !== miNombre) {
            throw new Error('Este ticket está asignado a otro técnico. No tienes permiso para editarlo.');
          }
          break;
        }
      }
    }

    // ── 1. Fecha ────────────────────────────────────────────
    var fechaFormateada = '';
    if (payload.fechaRep) {
      var partes = payload.fechaRep.split('-');
      fechaFormateada = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    }

    // ── 2. Costo ────────────────────────────────────────────
    var costoNumerico = payload.costo ? parseFloat(payload.costo) : '';

    // ── 3. Fotos ────────────────────────────────────────────
    var fotosExistentes = Array.isArray(payload.fotosExistentes)
      ? payload.fotosExistentes.filter(function (u) { return u && String(u).trim() !== ''; })
      : [];

    var fotosNuevasUrls = [];
    if (Array.isArray(payload.fotosNuevasBase64) && payload.fotosNuevasBase64.length > 0) {
      var disponibles = CONFIG.MAX_FOTOS - fotosExistentes.length;
      if (disponibles > 0) {
        var base64ParaSubir = payload.fotosNuevasBase64.slice(0, disponibles);
        fotosNuevasUrls = subirFotosADrive_(base64ParaSubir, payload.codigo, fotosExistentes.length);
      }
    }

    var todasLasFotos = fotosExistentes
      .concat(fotosNuevasUrls)
      .filter(function (u) { return u && String(u).trim() !== ''; })
      .slice(0, CONFIG.MAX_FOTOS);

    while (todasLasFotos.length < CONFIG.MAX_FOTOS) todasLasFotos.push('');

    // ── 4. Mapeo de campos ──────────────────────────────────
    var mapeoCampos = {
      'TecnicoAsignado' : payload.tecnico         || '',
      'Estado'          : payload.estado          || '',
      'CostoReparacion' : costoNumerico,
      'ObservacionFinal': payload.observacionFinal || '',
      'FechaReparacion' : fechaFormateada,
      'Comentario1'     : payload.comentario1     || '',
      'Comentario2'     : payload.comentario2     || '',
      'Foto1'           : todasLasFotos[0],
      'Foto2'           : todasLasFotos[1],
      'Foto3'           : todasLasFotos[2],
      'Foto4'           : todasLasFotos[3],
      'Foto5'           : todasLasFotos[4]
    };

    var actualizado = actualizarFilaPorCodigo_(sheet, payload.codigo, mapeoCampos);
    if (!actualizado) throw new Error('No se encontró el ticket ' + payload.codigo + ' en la base de datos.');

    // ── 5. Reflejar TecnicoAsignado en Ingresos SIEMPRE ─────
    try {
      var sheetIngresosTec = getSheet_(CONFIG.SHEET_INGRESOS);
      actualizarFilaPorCodigo_(sheetIngresosTec, payload.codigo, {
        'TecnicoAsignado': payload.tecnico || ''
      });
    } catch (errTec) {
      console.error('No se pudo reflejar TecnicoAsignado en Ingresos: ' + errTec.message);
    }

    // ── 6. Reflejo adicional en Ingresos cuando pasa a LISTO ─
    var estadoNormalizado = String(payload.estado || '').toUpperCase().trim();
    if (estadoNormalizado === 'LISTO') {
      try {
        var sheetIngresos = getSheet_(CONFIG.SHEET_INGRESOS);
        actualizarFilaPorCodigo_(sheetIngresos, payload.codigo, {
          'Estado'          : payload.estado,
          'Costo'           : costoNumerico,
          'ObservacionFinal': payload.observacionFinal
        });
      } catch (errIngresos) {
        console.error('No se pudo reflejar el estado LISTO en Ingresos: ' + errIngresos.message);
      }
    }

    return { ok: true };
  } catch (err) {
    console.error('Error al actualizar reparación: ' + err.message);
    return { ok: false, error: err.message };
  }
}
/* =========================================================
 *  ACTUALIZAR ASESORÍA (Estado / Costo / ObservacionFinal /
 *  FechaVisita / TecnicoAsignado)
 *  Identifica la fila por la columna "IdIngreso"
 *
 *  payload.fechaVisita llega como "yyyy-MM-ddTHH:mm"
 *  (formato nativo de <input type="datetime-local">)
 *  payload.tecnico llega como texto simple (nombre del técnico
 *  seleccionado en el <select> del dashboard)
 * ========================================================= */

function updateAsesoriaBackend(payload) {
  try {
    if (!payload || !payload.id) throw new Error('ID de asesoría no proporcionado.');

    var sesion = requerirSesion_(payload.token);
    var sheet  = getSheet_(CONFIG.SHEET_ASESORIAS);

    // ── Bloqueo: una asesoría REALIZADA no admite más ediciones ──
    var dataActual    = sheet.getDataRange().getValues();
    var headersActual = dataActual[0].map(function (h) { return String(h).trim(); });
    var iIdIngreso    = headersActual.indexOf('IdIngreso');
    var iEstadoActual = headersActual.indexOf('Estado');
    var iTecnicoActual= headersActual.indexOf('TecnicoAsignado');

    if (iIdIngreso > -1) {
      for (var i = 1; i < dataActual.length; i++) {
        if (String(dataActual[i][iIdIngreso]).trim() === String(payload.id).trim()) {

          if (iEstadoActual > -1) {
            var estadoActual = String(dataActual[i][iEstadoActual] || '').toUpperCase().trim();
            if (estadoActual === 'REALIZADA') {
              throw new Error('Esta asesoría ya fue marcada como REALIZADA y no admite más ediciones.');
            }
          }

          // ── Bloqueo: un técnico no-admin solo puede editar sus propias asesorías ──
          if (!esAdmin_(sesion) && iTecnicoActual > -1) {
            var tecnicoActual = String(dataActual[i][iTecnicoActual] || '').trim().toLowerCase();
            var miNombre      = String(sesion.nombre || '').trim().toLowerCase();
            if (tecnicoActual && tecnicoActual !== miNombre) {
              throw new Error('Esta asesoría está asignada a otro técnico. No tienes permiso para editarla.');
            }
          }

          break;
        }
      }
    }

    var costoNumerico = (payload.costo !== undefined && payload.costo !== null && payload.costo !== '')
      ? parseFloat(payload.costo)
      : '';

    // ── Fecha y hora de visita ──
    var fechaVisitaFormateada = '';
    if (payload.fechaVisita) {
      var partesFV = String(payload.fechaVisita).split('T');
      var fParts   = (partesFV[0] || '').split('-');
      var hParts   = (partesFV[1] || '00:00').split(':');

      if (fParts.length === 3) {
        fechaVisitaFormateada = new Date(
          parseInt(fParts[0], 10),
          parseInt(fParts[1], 10) - 1,
          parseInt(fParts[2], 10),
          parseInt(hParts[0], 10) || 0,
          parseInt(hParts[1], 10) || 0
        );
      }
    }

    var mapeoCampos = {
      'Estado'          : payload.estado          || '',
      'Costo'           : costoNumerico,
      'ObservacionFinal': payload.observacionFinal || '',
      'TecnicoAsignado' : payload.tecnico          || ''
    };

    if (fechaVisitaFormateada) {
      mapeoCampos['FechaVisita'] = fechaVisitaFormateada;
    }

    var actualizado = actualizarFilaPorCampo_(sheet, 'IdIngreso', payload.id, mapeoCampos);
    if (!actualizado) throw new Error('No se encontró la asesoría con ID ' + payload.id + ' en la base de datos.');

    return { ok: true };
  } catch (err) {
    console.error('Error al actualizar asesoría: ' + err.message);
    return { ok: false, error: err.message };
  }
}

/* =========================================================
 *  GUARDAR UN INGRESO  (también hace upsert de cliente)
 * ========================================================= */

function saveIngreso(formData) {
  try {
    if (!formData) throw new Error('No se recibieron datos del formulario.');

    var nombre        = (formData.nombre       || '').toString().trim();
    var cedula        = (formData.cedula       || '').toString().replace(/\D/g, '');
    var celular       = (formData.celular      || '').toString().replace(/\D/g, '');
    var equipo        = (formData.equipo       || '').toString().trim();
    var tipo          = (formData.tipo         || '').toString();
    var marca         = (formData.marca        || '').toString();
    var accesorios    = Array.isArray(formData.accesorios) ? formData.accesorios.join(', ') : (formData.accesorios || '');
    var fallas        = (formData.fallas       || '').toString().trim();
    var observaciones = (formData.observaciones || '').toString().trim();
    var emailUser     = (formData.emailUser    || '').toString().trim();

    if (!nombre)  throw new Error('El nombre es obligatorio.');
    if (!cedula)  throw new Error('La cédula es obligatoria y debe ser numérica.');
    if (!celular) throw new Error('El celular es obligatorio y debe ser numérico.');
    if (!equipo)  throw new Error('El equipo es obligatorio.');
    if (!tipo)    throw new Error('Selecciona el tipo de equipo.');
    if (!marca)   throw new Error('Selecciona la marca del equipo.');

    // ── Upsert de cliente ──────────────────────────────────
    upsertCliente_(cedula, nombre, emailUser, celular);

    var sheetIngresos = getSheet_(CONFIG.SHEET_INGRESOS);
    var idIngreso     = getNextId_(sheetIngresos, 'IdIngreso');
    var hoy           = new Date();
    var fechaEntrega  = new Date(hoy.getTime());
    fechaEntrega.setDate(fechaEntrega.getDate() + CONFIG.DIAS_ENTREGA);

    // Se pasa "hoy" para que el código incluya la hora exacta del registro
    var codigo        = buildCodigo_(cedula, nombre, marca, hoy);

    var emailUsuario = '';
    try { emailUsuario = Session.getActiveUser().getEmail(); } catch (e) { emailUsuario = ''; }

    var firmaUrl  = saveBase64File_(formData.firma,  'Firma_'  + codigo + '.png',  'image/png');
    var imagenUrl = saveBase64File_(formData.imagen, 'Equipo_' + codigo + '.jpg',  'image/jpeg');

    var dataObjIngresos = {
      IdIngreso    : idIngreso,
      FechaIngreso : hoy,
      FechaEntrega : fechaEntrega,
      Nombre       : nombre,
      Cedula       : cedula,
      Celular      : celular,
      EmailUsuario : emailUsuario,
      Equipo       : equipo,
      Tipo         : tipo,
      Marca        : marca,
      Accesorios   : accesorios,
      Fallas       : fallas,
      Observaciones: observaciones,
      Firma        : firmaUrl,
      Estado       : 'INGRESADO',
      EmailUser    : emailUser,
      Imagen       : imagenUrl,
      Codigo       : codigo
    };
    appendObjectRow_(sheetIngresos, dataObjIngresos);

    // ── Espejo en Reparaciones ─────────────────────────────
    try {
      var sheetReparaciones   = getSheet_(CONFIG.SHEET_REPARACIONES);
      var dataObjReparaciones = {
        Codigo          : codigo,
        FechaIngreso    : hoy,
        FechaReparacion : '',
        Cliente         : nombre,
        Celular         : celular,
        Correo          : emailUser,
        Equipo          : equipo,
        Fallas          : fallas,
        Observaciones   : observaciones,
        Accesorios      : accesorios,
        TecnicoAsignado : '',
        Estado          : 'INGRESADO',
        Imagen          : imagenUrl,   // foto de recepción legacy
        Foto1           : '',          // fotos del técnico (se llenan desde Reparaciones)
        Foto2           : '',
        Foto3           : '',
        Foto4           : '',
        Foto5           : '',
        ObservacionFinal: '',
        CostoReparacion : '',
        Comentario1     : '',
        Comentario2     : ''
      };
      appendObjectRow_(sheetReparaciones, dataObjReparaciones);
    } catch (repErr) {
      console.error('Error al insertar fila en Reparaciones: ' + repErr.message);
      throw new Error('Ingreso guardado, pero falló el espejo en Reparaciones: ' + repErr.message);
    }

    // ── Notificación por correo ────────────────────────────
    var tz              = Session.getScriptTimeZone();
    var fechaIngresoStr = Utilities.formatDate(hoy,          tz, 'dd/MM/yyyy');
    var fechaEntregaStr = Utilities.formatDate(fechaEntrega, tz, 'dd/MM/yyyy');

    if (emailUser) {
      try {
        enviarNotificacionVIP({
          correo      : emailUser,
          codigo      : codigo,
          nombre      : nombre,
          equipo      : equipo,
          fechaIngreso: fechaIngresoStr,
          fechaEntrega: fechaEntregaStr,
          imagenUrl   : imagenUrl
        });
      } catch (mailErr) {
        console.error('No se pudo enviar la notificación: ' + mailErr.message);
      }
    }

    return {
      ok          : true,
      idIngreso   : idIngreso,
      codigo      : codigo,
      nombre      : nombre,
      equipo      : equipo,
      marca       : marca,
      fechaIngreso: fechaIngresoStr,
      fechaEntrega: fechaEntregaStr
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* =========================================================
 *  GUARDAR UNA ASESORÍA  (también hace upsert de cliente)
 *  ─────────────────────────────────────────────────────────
 *  La hoja "Asesoria" debe tener las columnas:
 *    IdIngreso | FechaIngreso | Nombre | Cedula |
 *    Celular | EmailUsuario | Solicitud | Fallas | Observaciones |
 *    Estado | EmailUser | Imagen | Costo | ObservacionFinal |
 *    FechaVisita | TecnicoAsignado
 *
 *  Nota: la fecha/hora de visita y el técnico asignado NO se
 *  piden al cliente al crear la solicitud; se agendan/asignan
 *  después desde el dashboard, mediante updateAsesoriaBackend().
 * ========================================================= */

function saveAsesoria(formData) {
  try {
    if (!formData) throw new Error('No se recibieron datos del formulario.');

    var nombre        = (formData.nombre        || '').toString().trim();
    var cedula        = (formData.cedula        || '').toString().replace(/\D/g, '');
    var celular       = (formData.celular       || '').toString().replace(/\D/g, '');
    var solicitud     = (formData.solicitud     || '').toString().trim();
    var fallas        = (formData.fallas        || '').toString().trim();
    var observaciones = (formData.observaciones || '').toString().trim();
    var emailUser     = (formData.emailUser     || '').toString().trim();

    if (!nombre)    throw new Error('El nombre es obligatorio.');
    if (!cedula)    throw new Error('La cédula es obligatoria y debe ser numérica.');
    if (!celular)   throw new Error('El celular es obligatorio y debe ser numérico.');
    if (!solicitud) throw new Error('Selecciona el tipo de asesoría solicitada.');

    // ── Upsert de cliente ──────────────────────────────────
    upsertCliente_(cedula, nombre, emailUser, celular);

    var sheetAsesorias = getSheet_(CONFIG.SHEET_ASESORIAS);
    var idAsesoria     = getNextId_(sheetAsesorias, 'IdIngreso');
    var hoy            = new Date();

    var emailUsuario = '';
    try { emailUsuario = Session.getActiveUser().getEmail(); } catch (e) { emailUsuario = ''; }

    var imagenUrl = formData.imagen ? saveBase64File_(formData.imagen, 'Asesoria_' + idAsesoria + '.jpg', 'image/jpeg') : '';

    var dataObjAsesorias = {
      IdIngreso       : idAsesoria,
      FechaIngreso    : hoy,
      Nombre          : nombre,
      Cedula          : cedula,
      Celular         : celular,
      EmailUsuario    : emailUsuario,
      Solicitud       : solicitud,
      Fallas          : fallas,
      Observaciones   : observaciones,
      Estado          : 'PENDIENTE',
      EmailUser       : emailUser,
      Imagen          : imagenUrl,
      Costo           : '',
      ObservacionFinal: '',
      FechaVisita     : '',   // se agenda después desde el dashboard
      TecnicoAsignado : ''    // se asigna después desde el dashboard
    };
    appendObjectRow_(sheetAsesorias, dataObjAsesorias);

    // ── Notificación por correo ────────────────────────────
    var tz              = Session.getScriptTimeZone();
    var fechaIngresoStr = Utilities.formatDate(hoy, tz, 'dd/MM/yyyy');

    if (emailUser) {
      try {
        enviarNotificacionAsesoria({
          correo      : emailUser,
          idAsesoria  : idAsesoria,
          nombre      : nombre,
          solicitud   : solicitud,
          fechaIngreso: fechaIngresoStr,
          imagenUrl   : imagenUrl
        });
      } catch (mailErr) {
        console.error('No se pudo enviar la notificación de asesoría: ' + mailErr.message);
      }
    }

    return {
      ok          : true,
      idAsesoria  : idAsesoria,
      nombre      : nombre,
      solicitud   : solicitud,
      fechaIngreso: fechaIngresoStr
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* =========================================================
 *  ACTUALIZAR ESTADO → ENTREGADO (desde el dashboard de Ingresos)
 * ========================================================= */

function actualizarEstado(codigo, nuevoEstado) {
  try {
    if (!codigo) throw new Error('Código no proporcionado.');
    var estadoPermitido = String(nuevoEstado || '').toUpperCase().trim();
    if (estadoPermitido !== 'ENTREGADO') {
      throw new Error('Solo se permite cambiar a ENTREGADO desde esta acción.');
    }

    var sheetIngresos       = getSheet_(CONFIG.SHEET_INGRESOS);
    var actualizadoIngresos = actualizarFilaPorCodigo_(sheetIngresos, codigo, { 'Estado': 'ENTREGADO' });
    if (!actualizadoIngresos) {
      throw new Error('No se encontró el código "' + codigo + '" en la hoja de Ingresos.');
    }

    try {
      var sheetReparaciones = getSheet_(CONFIG.SHEET_REPARACIONES);
      actualizarFilaPorCodigo_(sheetReparaciones, codigo, { 'Estado': 'ENTREGADO' });
    } catch (repErr) {
      console.warn('No se pudo actualizar Reparaciones para ' + codigo + ': ' + repErr.message);
    }

    return true;
  } catch (err) {
    console.error('actualizarEstado error: ' + err.message);
    return false;
  }
}

/* =========================================================
 *  ACTUALIZAR ESTADO → REALIZADA (desde el dashboard de Asesorías)
 *  Identifica la fila por la columna "IdIngreso"
 * ========================================================= */

function actualizarEstadoAsesoria(id, nuevoEstado, token) {
  try {
    if (!id) throw new Error('ID no proporcionado.');
    var estadoPermitido = String(nuevoEstado || '').toUpperCase().trim();
    if (estadoPermitido !== 'REALIZADA') {
      throw new Error('Solo se permite cambiar a REALIZADA desde esta acción.');
    }

    var sesion = requerirSesion_(token);
    var sheet  = getSheet_(CONFIG.SHEET_ASESORIAS);

    if (!esAdmin_(sesion)) {
      var data    = sheet.getDataRange().getValues();
      var headers = data[0].map(function (h) { return String(h).trim(); });
      var iId     = headers.indexOf('IdIngreso');
      var iTec    = headers.indexOf('TecnicoAsignado');
      var miNombre = String(sesion.nombre || '').trim().toLowerCase();

      for (var i = 1; i < data.length; i++) {
        if (String(data[i][iId]).trim() === String(id).trim()) {
          var tecnicoActual = String(data[i][iTec] || '').trim().toLowerCase();
          if (tecnicoActual && tecnicoActual !== miNombre) {
            throw new Error('Esta asesoría está asignada a otro técnico.');
          }
          break;
        }
      }
    }

    var actualizado = actualizarFilaPorCampo_(sheet, 'IdIngreso', id, { 'Estado': 'REALIZADA' });
    if (!actualizado) {
      throw new Error('No se encontró la asesoría con ID "' + id + '".');
    }
    return true;
  } catch (err) {
    console.error('actualizarEstadoAsesoria error: ' + err.message);
    return false;
  }
}

/* =========================================================
 *  AUTENTICACIÓN Y SESIONES
 * ========================================================= */
/* =========================================================
 *  SESIONES (usando CacheService)
 * ========================================================= */

function crearSesion_(usuario) {
  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put('sess_' + token, JSON.stringify({
    nombre : usuario.nombre,
    usuario: usuario.usuario,
    rol    : usuario.rol
  }), CONFIG.SESSION_TTL_SECONDS);
  return token;
}

function obtenerSesion_(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var raw   = cache.get('sess_' + token);
  return raw ? JSON.parse(raw) : null;
}

function esAdmin_(sesion) {
  return !!sesion && String(sesion.rol || '').trim().toLowerCase() === 'admin';
}

function requerirSesion_(token) {
  var sesion = obtenerSesion_(token);
  if (!sesion) throw new Error('Sesión inválida o expirada. Vuelve a iniciar sesión.');
  return sesion;
}

function loginUser(usuario, clave) {
  try {
    if (!usuario || !clave) {
      return { success: false, message: 'Ingresa usuario y contraseña.' };
    }

    var sheet    = getSheet_(CONFIG.SHEET_USUARIOS);
    var usuarios = sheetToObjects_(sheet);

    var userMatch = usuarios.find(function (u) {
      var userVal = String(u.Usuario || u.usuario || '').trim().toLowerCase();
      var passVal = String(u.Password || u.Contrasena || u.Clave || u.password || '').trim();
      return userVal === String(usuario).trim().toLowerCase() && passVal === String(clave).trim();
    });

    if (userMatch) {
      var userInfo = {
        nombre : userMatch.Nombre || userMatch.Usuario || 'Usuario',
        usuario: userMatch.Usuario,
        rol    : userMatch.Rol || 'Tecnico'
      };
      var token = crearSesion_(userInfo);
      return { success: true, user: userInfo, token: token };
    } else {
      return { success: false, message: 'Usuario o contraseña incorrectos.' };
    }
  } catch (err) {
    console.error('Error en loginUser:', err.message);
    return { success: false, message: 'Error en el servidor: ' + err.message };
  }
}