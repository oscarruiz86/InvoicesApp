import type { NotificationType } from '../domain/notification';
import { roleLabels } from '@shared/role-labels';
import { NotificationTemplateError } from '../application/ports';
interface Template { readonly required: readonly string[]; readonly subject: string; readonly text: string; readonly html: string }

export function formatInvitationRoles(roles: readonly string[]): string {
  if (!roles.length || roles.some(role => !Object.hasOwn(roleLabels, role))) throw new NotificationTemplateError();
  return roles.map(role => roleLabels[role as keyof typeof roleLabels]).join(', ');
}
const templates: Record<NotificationType, Record<string, Template>> = {
  INVITATION_CREATED: { es: { required: ['organizationName', 'roles', 'expiresAt', 'link'], subject: 'Invitación a {{organizationName}}',
    text: 'Has sido invitado a {{organizationName}} con el rol {{roles}}. La invitación vence el {{expiresAt}}. Acepta aquí: {{link}}',
    html: '<p>Has sido invitado a <strong>{{organizationName}}</strong> con el rol {{roles}}.</p><p>La invitación vence el {{expiresAt}}.</p><p><a href="{{link}}">Aceptar invitación</a></p>' } },
  INVITATION_RESENT: { es: { required: ['organizationName', 'roles', 'expiresAt', 'link'], subject: 'Recordatorio de invitación a {{organizationName}}',
    text: 'Te reenviamos la invitación a {{organizationName}} con el rol {{roles}}. Vence el {{expiresAt}}. Acepta aquí: {{link}}',
    html: '<p>Te reenviamos la invitación a <strong>{{organizationName}}</strong> con el rol {{roles}}.</p><p>Vence el {{expiresAt}}.</p><p><a href="{{link}}">Aceptar invitación</a></p>' } },
};
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!); }
function render(template: string, values: Record<string, string>, escape: boolean) { return template.replace(/{{([A-Za-z][A-Za-z0-9]*)}}/g, (_, key: string) => escape ? escapeHtml(values[key]!) : values[key]!); }
export function renderInvitationTemplate(input: { type: NotificationType; language: string; values: Record<string, string> }) {
  const template = templates[input.type]?.[input.language]; if (!template) throw new NotificationTemplateError();
  const keys = Object.keys(input.values); if (template.required.some(key => typeof input.values[key] !== 'string') || keys.some(key => !template.required.includes(key))) throw new NotificationTemplateError();
  for (const content of [template.subject, template.text, template.html]) for (const match of content.matchAll(/{{([A-Za-z][A-Za-z0-9]*)}}/g))
    if (!template.required.includes(match[1]!)) throw new NotificationTemplateError();
  return { subject: render(template.subject, input.values, false), text: render(template.text, input.values, false), html: render(template.html, input.values, true) };
}
