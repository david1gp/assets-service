import type { TelegramUploadEvent } from "./telegramUploadEventSchema.js"

const htmlEscape = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

const linkCreate = (label: string, url: string): string => `<a href="${htmlEscape(url)}">${htmlEscape(label)}</a>`

export const telegramMessageCreate = (event: TelegramUploadEvent): string => {
  const organization = event.organizationSlug ?? event.organizationId
  const project = event.projectSlug ?? event.projectId
  const previewUrl = event.previewUrl ?? event.assetUrl
  const lines = [
    "Asset uploaded",
    "",
    `Organization: ${htmlEscape(organization)}`,
    `Project: ${htmlEscape(project)}`,
    `Uploader: ${htmlEscape(event.uploaderId)}`,
    `Filename: ${htmlEscape(event.originalFilename)}`,
    `Integration note: ${htmlEscape(event.integrationNote)}`,
    `Uploaded: ${htmlEscape(event.uploadedAt)}`,
    "",
    linkCreate("Open asset", previewUrl ?? event.adminUrl),
    linkCreate("Open admin", event.adminUrl),
  ]
  if (previewUrl !== undefined) lines.splice(lines.length - 2, 0, linkCreate("Open preview", previewUrl))
  return lines.join("\n")
}
