import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { command, freePort, startKeycloakFixture, waitFor } from './auth-fixture.mjs';
import { startCompanyMongo } from './company-mongo-fixture.mjs';
import { grantCeiling } from '../backend/src/modules/identity/domain/permissions.ts';
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));
const mongoose = backendRequire('mongoose');
const { chromium, expect: baseExpect } = frontendRequire('@playwright/test');
const expect = baseExpect.configure({ timeout: 30000 });
const mongo = await startCompanyMongo(); const database = `company_browser_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(mongo.uri, { dbName: database });
const webPort = await freePort(); const apiPort = await freePort(); const web = `http://localhost:${webPort}`; const api = `http://127.0.0.1:${apiPort}`;
let fixture; let browser; const stops = []; let diagnosticPage; let diagnosticLocalPage;
async function start(directory, entry, args, env, url) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: fileURLToPath(new URL(`../${directory}/`, import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  let diagnostics = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { diagnostics = (diagnostics + data).slice(-4000); });
  stops.push(async () => { if (child.exitCode === null) { if (process.platform === 'win32') await command('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']); else child.kill(); } });
  await waitFor(url, 180000, () => { if (child.exitCode !== null) throw new Error(directory + ' failed: ' + diagnostics); });
}
try {
  await connection.asPromise();
  await connection.collection('authorization_policies').insertOne({ _id: 'active', version: 1, grants: grantCeiling, pendingEvents: [] });
  fixture = await startKeycloakFixture([web], { accessTokenLifespan: 900 }); await fixture.setApplicationRoles(['APP_ADMIN']);
  const target = await fixture.companyDirectoryFixture();
  console.log('Company acceptance: isolated MongoDB and Keycloak ready.');
  const uri = new URL(mongo.uri); uri.pathname = '/' + database;
  await start('backend', 'node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1', '--port', String(apiPort), '--webpack'], { NODE_ENV: 'development', MONGODB_URI: uri.href, KEYCLOAK_ISSUER_URL: fixture.issuer, KEYCLOAK_AUDIENCE: 'invoices-api', KEYCLOAK_JWKS_URL: fixture.issuer + '/protocol/openid-connect/certs', KEYCLOAK_DIRECTORY_CLIENT_ID: target.clientId, KEYCLOAK_DIRECTORY_CLIENT_SECRET: target.clientSecret, NEXT_TELEMETRY_DISABLED: '1' }, api + '/api/health');
  for (const [path, method] of [['/api/auth/me','GET'],['/api/auth/permissions','GET'],['/api/organization-contexts','GET'],['/api/organization-contexts/resolve','POST'],['/api/companies','GET'],['/api/companies/0123456789abcdef01234567','GET'],['/api/companies/0123456789abcdef01234567/status','POST'],['/api/companies/0123456789abcdef01234567/administrators','GET'],['/api/companies/0123456789abcdef01234567/administrators/a/revoke','POST']]) assert.equal((await fetch(api + path, { method, signal: AbortSignal.timeout(120000) })).status,401);
  await start('frontend', 'node_modules/vite/bin/vite.js', ['--host','127.0.0.1','--port',String(webPort),'--strictPort'], { VITE_API_BASE_URL:'/api', API_PROXY_TARGET:api, VITE_KEYCLOAK_URL:fixture.base,VITE_KEYCLOAK_REALM:fixture.realm,VITE_KEYCLOAK_CLIENT_ID:'invoices-web' }, web);
  browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await adminContext.newPage(); diagnosticPage = page;
  let token; page.on('response',async response => { if(response.url().endsWith('/protocol/openid-connect/token') && response.ok())token=(await response.json()).access_token; });
  const login = async (page, username, password) => { await page.goto(web+'/companies'); await page.locator('#username').fill(username); await page.locator('#password').fill(password); await page.locator('#kc-login').click(); await expect(page.getByRole('heading',{name:/Sesión activa|Selecciona una organización/})).toBeVisible(); if(await page.getByRole('heading',{name:'Sesión activa'}).count())await page.getByRole('link',{name:'Empresas',exact:true}).click(); };
  await login(page, fixture.username, fixture.password);
  await expect(page.getByRole('heading',{name:'Empresas',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Crear empresa',exact:true}).click();
  await page.getByLabel('Número de documento',{exact:false}).fill('900001'); await page.getByLabel('Razón social',{exact:false}).fill('Empresa de aceptación'); await page.getByLabel('Correo electrónico',{exact:false}).fill('CONTACTO@example.com');
  await page.getByRole('button',{name:'Guardar empresa'}).click();
  await expect(page.getByRole('heading',{name:'Empresa de aceptación',exact:true})).toBeVisible();
  const id = page.url().split('/').at(-1);
  await page.getByLabel('Identificador del administrador en Keycloak').fill(target.subject); const associationResponse=page.waitForResponse(response=>response.url().includes(`/api/companies/${id}/administrators`)&&response.request().method()==='POST',{timeout:15000}); page.on('requestfailed',request=>{if(request.url().includes('/api/companies/'))console.log(`Company request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`);}); await page.getByRole('button',{name:'Asociar administrador',exact:true}).click(); const associationResult=await associationResponse; console.log(`Administrator association HTTP ${associationResult.status()}: ${await associationResult.text()}`);
  await expect(page.getByText(target.subject,{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Editar empresa',exact:true}).click(); await page.getByLabel('Ciudad',{exact:true}).fill('Bogotá'); await page.getByRole('button',{name:'Guardar empresa'}).click();
  await expect(page.getByRole('heading',{name:'Empresa de aceptación',exact:true})).toBeVisible();
  const headers=()=>({Authorization:`Bearer ${token}`,'Content-Type':'application/json'});
  const request=async(path,method='GET',body)=>fetch(api+path,{method,headers:headers(),...(body?{body:JSON.stringify(body)}:{})});
  const otherResponse=await request('/api/companies?scope=global','POST',{documentNumber:'900002',businessName:'Empresa ajena',email:'other@example.com'});assert.equal(otherResponse.status,201);const other=await otherResponse.json();
  assert.equal((await request('/api/companies?scope=global','POST',{documentNumber:'900001',businessName:'Duplicada',email:'other@example.com'})).status,409);
  assert.equal((await request('/api/companies?scope=global&pageSize=101')).status,400);
  assert.equal((await request(`/api/companies/${id}?scope=global`,'DELETE')).status,405);
  const invalidAdmin=await request(`/api/companies/${id}/administrators?scope=global`,'POST',{expectedVersion:(await(await request(`/api/companies/${id}?scope=global`)).json()).version,subject:'missing-user'});assert.equal(invalidAdmin.status,400);
  const localContext=await browser.newContext({viewport:{width:360,height:800}});const localPage=await localContext.newPage();diagnosticLocalPage=localPage;let localToken;
  localPage.on('response',async response=>{if(response.url().endsWith('/protocol/openid-connect/token')&&response.ok())localToken=(await response.json()).access_token;});
  await login(localPage,target.username,target.password);await expect(localPage.getByRole('heading',{name:'Empresas',exact:true})).toBeVisible();
  await expect(localPage.getByRole('link',{name:'Crear empresa',exact:true})).toHaveCount(0);
  assert.equal((await fetch(`${api}/api/companies/${other.company.id}?scope=organization&companyId=${id}`,{headers:{Authorization:`Bearer ${localToken}`}})).status,404);
  await localPage.getByRole('link',{name:'Ver empresa'}).click();await expect(localPage.getByRole('button',{name:'Desactivar empresa'})).toHaveCount(0);await expect(localPage.getByRole('heading',{name:'Administradores',exact:true})).toHaveCount(0);
  await localPage.getByRole('link',{name:'Editar empresa'}).click();await localPage.getByLabel('Ciudad',{exact:true}).fill('Medellín');await localPage.getByRole('button',{name:'Guardar empresa'}).click();await expect(localPage.getByRole('heading',{name:'Empresa de aceptación',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Empresas',exact:true}).click();await expect(page.getByRole('heading',{name:'Empresas',exact:true})).toBeVisible();await page.getByLabel('Buscar por nombre o documento').fill('Empresa de aceptación');await expect(page.getByRole('link',{name:'Ver empresa'})).toHaveCount(1);await page.getByRole('link',{name:'Ver empresa'}).click();await expect(page.getByRole('button',{name:'Desactivar empresa'})).toBeVisible();await page.getByRole('button',{name:'Desactivar empresa'}).click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('button',{name:'Desactivar empresa'})).toBeVisible();
  await page.getByRole('button',{name:'Desactivar empresa'}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('button',{name:'Activar empresa'})).toBeVisible();
  assert.equal((await fetch(`${api}/api/companies/${id}?scope=organization&companyId=${id}`,{headers:{Authorization:`Bearer ${localToken}`}})).status,403);
  await localPage.getByRole('button',{name:'Cambiar organización'}).click();await expect(localPage.getByText('No tienes organizaciones ni contextos autorizados disponibles.')).toBeVisible();
  await page.getByRole('button',{name:'Activar empresa'}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('button',{name:'Desactivar empresa'})).toBeVisible();
  await page.getByRole('button',{name:'Desasociar administrador'}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByText('Asociación inactiva',{exact:true})).toBeVisible();
  const directory=new URL('../.artifacts/company-management/',import.meta.url);await mkdir(directory,{recursive:true});
  for(const width of [360,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:fileURLToPath(new URL(`detail-${width}.png`,directory)),fullPage:true});}
  await page.getByRole('link',{name:'Empresas',exact:true}).click();await page.getByLabel('Buscar por nombre o documento').fill('Empresa de aceptación');await expect(page.getByRole('link',{name:'Ver empresa'})).toHaveCount(1);
  await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body));
  const history=await connection.collection('company_management_events').find({companyId:id}).toArray();for(const action of ['COMPANY_CREATED','COMPANY_UPDATED','COMPANY_DEACTIVATED','COMPANY_ACTIVATED','COMPANY_ADMIN_ASSOCIATED','ASSOCIATION_REVOKED'])assert(history.some(event=>event.action===action));
  await page.goto(api+'/api/docs');await expect(page.getByText('Companies',{exact:true}).first()).toBeVisible();
  console.log('Company acceptance: CRUD, real Keycloak directory, roles, isolation, state invalidation, association/revocation, audit, Swagger and responsive layout passed.');
} catch(error) {
  if(diagnosticPage){const directory=new URL('../.artifacts/company-management/',import.meta.url);await mkdir(directory,{recursive:true});await diagnosticPage.screenshot({path:fileURLToPath(new URL('failure.png',directory)),fullPage:true}).catch(()=>{});}
  if(diagnosticLocalPage){const directory=new URL('../.artifacts/company-management/',import.meta.url);await mkdir(directory,{recursive:true});await diagnosticLocalPage.screenshot({path:fileURLToPath(new URL('failure-local.png',directory)),fullPage:true}).catch(()=>{});}
  throw error;
} finally {
  await browser?.close();for(const stop of stops.reverse())await stop();
  if(connection.readyState===1&&connection.name===database&&/^company_browser_[a-f0-9]{32}_test$/.test(database))await connection.dropDatabase();await connection.close();await fixture?.close();await mongo.stop();
}
