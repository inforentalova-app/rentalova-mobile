#!/usr/bin/env node
// Crea la cuenta demo de Apple en Firebase Auth + Firestore.
// Ejecución única: node scripts/create-demo-user.mjs

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parsea .env sin dependencias externas
const envRaw = readFileSync(resolve(__dirname, '../.env'), 'utf-8');
const env = Object.fromEntries(
  envRaw
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#') && l.trim())
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const API_KEY    = env.EXPO_PUBLIC_FIREBASE_API_KEY;
const PROJECT_ID = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const EMAIL      = 'demo@rentalova.com';
const PASSWORD   = 'Demo1234!';

if (!API_KEY || !PROJECT_ID) {
  console.error('❌ No se encontraron EXPO_PUBLIC_FIREBASE_API_KEY o EXPO_PUBLIC_FIREBASE_PROJECT_ID en .env');
  process.exit(1);
}

async function main() {
  let uid, idToken;

  // 1. Intentar crear usuario
  const signUpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const signUpData = await signUpRes.json();

  if (!signUpRes.ok) {
    if (signUpData.error?.message === 'EMAIL_EXISTS') {
      console.log('⚠️  Usuario ya existe. Iniciando sesión para obtener UID...');
      const signInRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
        },
      );
      const signInData = await signInRes.json();
      if (!signInRes.ok) {
        console.error('❌ Error al iniciar sesión:', signInData.error?.message);
        process.exit(1);
      }
      uid     = signInData.localId;
      idToken = signInData.idToken;
    } else {
      console.error('❌ Error al crear usuario:', signUpData.error?.message);
      process.exit(1);
    }
  } else {
    uid     = signUpData.localId;
    idToken = signUpData.idToken;
    console.log(`✅ Usuario creado en Firebase Auth (UID: ${uid})`);
  }

  // 2. Crear/actualizar documento en Firestore users/{uid}
  const firestoreUrl =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}` +
    '?updateMask.fieldPaths=displayName' +
    '&updateMask.fieldPaths=email' +
    '&updateMask.fieldPaths=verificationStatus' +
    '&updateMask.fieldPaths=createdAt' +
    '&updateMask.fieldPaths=isDemo';

  const patchRes = await fetch(firestoreUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: {
        displayName:        { stringValue: 'Apple Reviewer' },
        email:              { stringValue: EMAIL },
        verificationStatus: { stringValue: 'verified' },
        createdAt:          { stringValue: new Date().toISOString() },
        isDemo:             { booleanValue: true },
      },
    }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.json();
    console.error('❌ Error al crear documento Firestore:', JSON.stringify(err, null, 2));
    process.exit(1);
  }

  console.log(`✅ Documento Firestore creado/actualizado en users/${uid}`);
  console.log('\n🎉 Cuenta demo lista para App Store Connect:');
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);
  console.log('   Estado:   verified (sin restricciones)\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
