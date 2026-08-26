#!/usr/bin/env python3
"""
Migración única: legacy/VIP.xlsx  ->  Supabase (Postgres + Auth)

Requisitos previos:
  1. Haber creado el proyecto en supabase.com y ejecutado
     supabase/migrations/0001_init_schema.sql en el SQL Editor.
  2. pip install requests openpyxl
  3. Variables de entorno (NUNCA hardcodear la service_role key en el código):
       SUPABASE_URL               -> https://xxxx.supabase.co
       SUPABASE_SERVICE_ROLE_KEY  -> Project Settings > API > service_role (secreta, bypassa RLS)

Uso:
  python scripts/migrate_xlsx_to_supabase.py

Es re-ejecutable: usa upsert (on_conflict) en los catálogos y clientes, y evita
duplicar usuarios/tickets/asesorías ya migrados (busca por email / codigo / id).
"""

import os
import sys
import re
from pathlib import Path

import openpyxl
import requests

XLSX_PATH = Path(__file__).resolve().parent.parent / "legacy" / "VIP.xlsx"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    sys.exit("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.")

REST = f"{SUPABASE_URL}/rest/v1"
AUTH_ADMIN = f"{SUPABASE_URL}/auth/v1/admin"
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


# ---------------------------------------------------------------- helpers --
def leer_hoja(wb, nombre):
    ws = wb[nombre]
    filas = list(ws.iter_rows(values_only=True))
    headers = [str(h).strip() for h in filas[0]]
    return [dict(zip(headers, fila)) for fila in filas[1:] if any(v is not None for v in fila)]


def solo_digitos(valor):
    return re.sub(r"\D", "", str(valor or ""))


def texto(valor):
    if valor is None:
        return None
    return str(valor).strip() or None


def correo_sintetico(usuario):
    return re.sub(r"\s+", ".", str(usuario or "").strip().lower()) + "@vip.local"


def upsert(tabla, filas, on_conflict):
    if not filas:
        return []
    resp = requests.post(
        f"{REST}/{tabla}?on_conflict={on_conflict}",
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"},
        json=filas,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get(tabla, params):
    resp = requests.get(f"{REST}/{tabla}", headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ------------------------------------------------------------- 1. USUARIOS --
def migrar_usuarios(filas):
    print(f"→ Usuarios: {len(filas)} filas")
    id_por_nombre = {}
    for r in filas:
        usuario = texto(r.get("Usuario"))
        nombre = texto(r.get("Nombre")) or usuario
        clave = texto(r.get("Clave")) or "CambiarClave123!"
        rol = "admin" if str(r.get("Rol", "")).strip().lower() == "admin" else "tecnico"
        celular = solo_digitos(r.get("Celular")) or None
        email = correo_sintetico(usuario)

        existentes = get("perfiles", {"usuario": f"eq.{usuario}", "select": "id"})
        if existentes:
            auth_id = existentes[0]["id"]
            print(f"  = {usuario} ya existe, se omite creación en Auth")
        else:
            resp = requests.post(
                f"{AUTH_ADMIN}/users",
                headers=HEADERS,
                json={"email": email, "password": clave, "email_confirm": True},
                timeout=30,
            )
            if resp.status_code >= 300:
                print(f"  ! Error creando auth user para {usuario}: {resp.text}")
                continue
            auth_id = resp.json()["id"]
            upsert(
                "perfiles",
                [{"id": auth_id, "usuario": usuario, "nombre": nombre, "rol": rol, "celular": celular}],
                on_conflict="id",
            )
            print(f"  + {usuario} ({rol}) creado")

        id_por_nombre[nombre.strip().lower()] = auth_id
    return id_por_nombre


# --------------------------------------------------------------- 2. MARCAS --
def migrar_marcas(filas):
    print(f"→ Marcas: {len(filas)} filas")
    payload = [{"nombre": texto(r.get("Marca"))} for r in filas if texto(r.get("Marca"))]
    upsert("marcas", payload, on_conflict="nombre")
    filas_db = get("marcas", {"select": "id,nombre"})
    return {r["nombre"].strip().lower(): r["id"] for r in filas_db}


def cargar_tipos_equipo():
    filas_db = get("tipos_equipo", {"select": "id,nombre"})
    return {r["nombre"].strip().lower(): r["id"] for r in filas_db}


# ------------------------------------------------------------- 3. CLIENTES --
def migrar_clientes(filas):
    print(f"→ Clientes: {len(filas)} filas")
    payload = []
    for r in filas:
        cedula = solo_digitos(r.get("Cedula"))
        if not cedula:
            continue
        payload.append(
            {
                "cedula": cedula,
                "nombre": texto(r.get("Nombre")) or "Sin nombre",
                "correo": texto(r.get("Correo")),
                "celular": solo_digitos(r.get("Celular")) or None,
            }
        )
    upsert("clientes", payload, on_conflict="cedula")


def asegurar_cliente(cedula, nombre, celular, correo=None):
    """Ingresos/Reparaciones/Asesorías legacy a veces referencian un cliente
    que no quedó (o quedó incompleto) en la hoja Clientes. Se crea al vuelo
    para no romper la FK cliente_cedula -> clientes(cedula)."""
    cedula = solo_digitos(cedula)
    if not cedula:
        return None
    upsert(
        "clientes",
        [{"cedula": cedula, "nombre": nombre or "Sin nombre", "celular": solo_digitos(celular) or None, "correo": correo}],
        on_conflict="cedula",
    )
    return cedula


# ---------------------------------------------------------- 4/5. TICKETS ---
def migrar_tickets(ingresos, reparaciones, marcas_por_nombre, tipos_por_nombre, tecnicos_por_nombre):
    print(f"→ Tickets: {len(ingresos)} ingresos / {len(reparaciones)} reparaciones (merge por Codigo)")
    reparaciones_por_codigo = {texto(r.get("Codigo")): r for r in reparaciones if texto(r.get("Codigo"))}

    for ing in ingresos:
        codigo = texto(ing.get("Codigo"))
        if not codigo:
            continue
        rep = reparaciones_por_codigo.get(codigo, {})

        cedula = asegurar_cliente(ing.get("Cedula"), ing.get("Nombre"), ing.get("Celular"), texto(ing.get("EmailUser")))
        if not cedula:
            print(f"  ! Ticket {codigo} sin cédula válida, se omite")
            continue

        marca_id = marcas_por_nombre.get(str(ing.get("Marca") or "").strip().lower())
        tipo_id = tipos_por_nombre.get(str(ing.get("Tipo") or "").strip().lower())
        tecnico_nombre = str(rep.get("TecnicoAsignado") or "").strip().lower()
        tecnico_id = tecnicos_por_nombre.get(tecnico_nombre)

        accesorios = [a.strip() for a in str(ing.get("Accesorios") or "").split(",") if a.strip()]

        fila = {
            "codigo": codigo,
            "cliente_cedula": cedula,
            "celular": solo_digitos(ing.get("Celular")) or "0",
            "correo_cliente": texto(ing.get("EmailUser")),
            "equipo": texto(ing.get("Equipo")) or "Sin especificar",
            "tipo_equipo_id": tipo_id,
            "marca_id": marca_id,
            "accesorios": accesorios,
            "fallas": texto(ing.get("Fallas")) or texto(rep.get("Fallas")),
            "observaciones": texto(ing.get("Observaciones")) or texto(rep.get("Observaciones")),
            "firma_url": texto(ing.get("Firma")),
            "imagen_recepcion_url": texto(ing.get("Imagen")),
            "estado": str(rep.get("Estado") or ing.get("Estado") or "INGRESADO").strip().upper(),
            "tecnico_id": tecnico_id,
            "costo": rep.get("CostoReparacion") or ing.get("Costo"),
            "observacion_final": texto(rep.get("ObservacionFinal")) or texto(ing.get("ObservacionFinal")),
            "comentario_1": texto(rep.get("Comentario1")),
            "comentario_2": texto(rep.get("Comentario2")),
            "fecha_ingreso": ing.get("FechaIngreso").isoformat() if ing.get("FechaIngreso") else None,
            "fecha_entrega_estimada": ing.get("FechaEntrega").isoformat() if ing.get("FechaEntrega") else None,
            "fecha_reparacion": rep.get("FechaReparacion").isoformat() if rep.get("FechaReparacion") else None,
        }
        existentes = get("tickets", {"codigo": f"eq.{codigo}", "select": "id"})
        if existentes:
            ticket_id = existentes[0]["id"]
            requests.patch(f"{REST}/tickets?id=eq.{ticket_id}", headers=HEADERS, json=fila, timeout=30)
        else:
            creados = upsert("tickets", [fila], on_conflict="codigo")
            ticket_id = creados[0]["id"] if creados else None

        if ticket_id:
            fotos = [texto(rep.get(f"Foto{i}")) for i in range(1, 6)]
            fotos_payload = [
                {"ticket_id": ticket_id, "url": url, "orden": i}
                for i, url in enumerate(fotos, start=1)
                if url
            ]
            if fotos_payload:
                requests.delete(f"{REST}/ticket_fotos?ticket_id=eq.{ticket_id}", headers=HEADERS, timeout=30)
                requests.post(f"{REST}/ticket_fotos", headers=HEADERS, json=fotos_payload, timeout=30)

    print("  ✓ tickets migrados")


# ------------------------------------------------------------ 6. ASESORIAS -
def migrar_asesorias(filas, tecnicos_por_nombre):
    print(f"→ Asesorías: {len(filas)} filas")
    for a in filas:
        cedula = asegurar_cliente(a.get("Cedula"), a.get("Nombre"), a.get("Celular"), texto(a.get("EmailUser")))
        if not cedula:
            continue
        tecnico_id = tecnicos_por_nombre.get(str(a.get("TecnicoAsignado") or "").strip().lower())

        fila = {
            "cliente_cedula": cedula,
            "celular": solo_digitos(a.get("Celular")) or "0",
            "correo_cliente": texto(a.get("EmailUser")),
            "solicitud": texto(a.get("Solicitud")) or "Otro",
            "fallas": texto(a.get("Fallas")),
            "observaciones": texto(a.get("Observaciones")),
            "imagen_url": texto(a.get("Imagen")),
            "estado": str(a.get("Estado") or "PENDIENTE").strip().upper(),
            "tecnico_id": tecnico_id,
            "costo": a.get("Costo"),
            "observacion_final": texto(a.get("ObservacionFinal")),
            "fecha_ingreso": a.get("FechaIngreso").isoformat() if a.get("FechaIngreso") else None,
            "fecha_visita": a.get("FechaVisita").isoformat() if a.get("FechaVisita") else None,
        }
        # No hay Codigo único en Asesoria legacy (solo IdIngreso, que no se conserva
        # 1:1 al re-insertar) -> se evita duplicar por (cliente_cedula, fecha_ingreso).
        dup = get(
            "asesorias",
            {"cliente_cedula": f"eq.{cedula}", "fecha_ingreso": f"eq.{fila['fecha_ingreso']}", "select": "id"},
        )
        if dup:
            requests.patch(f"{REST}/asesorias?id=eq.{dup[0]['id']}", headers=HEADERS, json=fila, timeout=30)
        else:
            requests.post(f"{REST}/asesorias", headers=HEADERS, json=fila, timeout=30)
    print("  ✓ asesorías migradas")


# --------------------------------------------------------------------- main
def main():
    if not XLSX_PATH.exists():
        sys.exit(f"No se encontró {XLSX_PATH}")

    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)

    tecnicos_por_nombre = migrar_usuarios(leer_hoja(wb, "Usuarios"))
    marcas_por_nombre = migrar_marcas(leer_hoja(wb, "Marca"))
    tipos_por_nombre = cargar_tipos_equipo()
    migrar_clientes(leer_hoja(wb, "Clientes"))
    migrar_tickets(
        leer_hoja(wb, "Ingresos"),
        leer_hoja(wb, "Reparaciones"),
        marcas_por_nombre,
        tipos_por_nombre,
        tecnicos_por_nombre,
    )
    migrar_asesorias(leer_hoja(wb, "Asesoria"), tecnicos_por_nombre)

    print("\nMigración completada.")


if __name__ == "__main__":
    main()
