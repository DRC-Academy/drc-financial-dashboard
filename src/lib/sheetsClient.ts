import { google } from "googleapis";

/**
 * Cliente autenticado de Google Sheets usando una Service Account.
 *
 * Variables de entorno requeridas (ver .env.local.example):
 *  - GOOGLE_SHEET_ID
 *  - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *  - GOOGLE_PRIVATE_KEY   (con \n literales si viene de .env)
 */

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Faltan credenciales de Google. Configurá GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY en el entorno."
    );
  }

  // En .env los saltos de línea vienen escapados como "\\n"
  const privateKey = rawKey.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("Falta GOOGLE_SHEET_ID en el entorno.");
  }
  return id;
}

/**
 * Devuelve todos los valores de una hoja (por nombre) como matriz de strings.
 * No lanza si la hoja no existe: devuelve null para que el caller decida
 * cómo degradar (p. ej. mostrar "sin datos").
 */
export async function readSheetValues(
  sheetName: string
): Promise<string[][] | null> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = getSheetId();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    return (res.data.values as string[][]) ?? [];
  } catch (err: unknown) {
    console.error(`[sheetsClient] Error leyendo hoja "${sheetName}":`, err);
    return null;
  }
}
