import { siteConfig } from "./config.js";
import { normalizeApplication, validateApplication } from "./application-fields.js";

const clean = (value) => typeof value === "string" ? value.trim() : "";

function publicUrl(value, allowRelative = false) {
  const url = clean(value);
  if (!url || url.startsWith("//")) return "";

  try {
    const parsed = new URL(url, allowRelative ? document.baseURI : undefined);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
  } catch {
    return "";
  }
  return "";
}

function renderConfig(config) {
  const startMonth = clean(config.startMonth);
  if (startMonth) {
    for (const element of document.querySelectorAll("[data-start]")) {
      element.textContent = `Старт — ${startMonth}`;
    }
  }

  const details = {
    place: [config.city, config.address].map(clean).filter(Boolean).join(", "),
    schedule: clean(config.schedule),
  };

  for (const [key, value] of Object.entries(details)) {
    if (!value) continue;
    document.getElementById(key).textContent = value;
    document.getElementById(`${key}-row`).hidden = false;
    document.getElementById("course-details").hidden = false;
  }

  for (const card of document.querySelectorAll("[data-teacher]")) {
    const teacher = config.teachers[card.dataset.teacher];
    const name = clean(teacher.name);
    if (name) card.querySelector(".teacher-name").textContent = name;

    const photoUrl = publicUrl(teacher.photo, true);
    if (photoUrl) {
      const photo = card.querySelector(".teacher-photo");
      photo.addEventListener("error", () => { photo.hidden = true; }, { once: true });
      photo.src = photoUrl;
      photo.hidden = false;
    }
  }

  const phone = clean(config.contacts.phone);
  const dialNumber = phone.replace(/[^\d+]/g, "");
  const contacts = [
    ["Instagram", publicUrl(config.contacts.instagram)],
    ["Telegram", publicUrl(config.contacts.telegram)],
    ["WhatsApp", publicUrl(config.contacts.whatsapp)],
    [phone, /^\+?\d{7,15}$/.test(dialNumber) ? `tel:${dialNumber}` : ""],
  ];

  const list = document.getElementById("contact-list");
  for (const [label, href] of contacts) {
    if (!href) continue;
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.textContent = label;
    link.href = href;
    item.append(link);
    list.append(item);
  }
  document.getElementById("contacts").hidden = !list.children.length;
}

renderConfig(siteConfig);

const form = document.getElementById("application-form");
const fieldset = document.getElementById("form-fields");
const submitButton = document.getElementById("submit-button");
const status = document.getElementById("form-status");
const fields = ["name", "contact", "group", "format"];
const groupSelect = form.elements.namedItem("group");
const isPreview = document.documentElement.hasAttribute("data-preview");

if (isPreview) {
  submitButton.disabled = true;
  setStatus("Демонстрационная версия. Приём заявок пока недоступен.");
}

function setStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function showFieldError(field, message) {
  const input = form.elements.namedItem(field);
  const error = document.getElementById(`${field}-error`);
  error.textContent = message || "";
  error.hidden = !message;
  if (message) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
}

function showErrors(errors) {
  for (const field of fields) showFieldError(field, errors[field]);
  return fields.find((field) => errors[field]);
}

function readApplication() {
  return normalizeApplication(Object.fromEntries(new FormData(form)));
}

function updateGroupLabels() {
  const forChild = groupSelect.value === "children";
  document.getElementById("name-label").textContent = forChild ? "Имя родителя" : "Ваше имя";
  document.getElementById("contact-label").textContent = forChild ? "Контакт родителя" : "Телефон или Telegram";

  const errors = validateApplication(readApplication());
  for (const field of ["name", "contact", "group"]) {
    if (form.elements.namedItem(field).hasAttribute("aria-invalid")) showFieldError(field, errors[field]);
  }
}

groupSelect.addEventListener("change", updateGroupLabels);

for (const link of document.querySelectorAll("[data-group]")) {
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!fieldset.disabled) {
      groupSelect.value = link.dataset.group;
      updateGroupLabels();
      if (status.dataset.state === "success") setStatus("");
    }
    document.getElementById("apply-title").focus({ preventScroll: true });
    // Clicking the same anchor again should still return to the form.
    if (location.hash === "#apply") document.getElementById("apply").scrollIntoView();
  });
}

form.addEventListener("input", ({ target }) => {
  if (!fields.includes(target.name)) return;
  if (target.hasAttribute("aria-invalid")) {
    const errors = validateApplication(readApplication());
    showFieldError(target.name, errors[target.name]);
  }
  if (status.dataset.state === "success") setStatus("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isPreview || fieldset.disabled) return;

  const application = readApplication();
  const invalid = showErrors(validateApplication(application));
  if (invalid) {
    setStatus("Проверьте отмеченные поля.", "error");
    form.elements.namedItem(invalid).focus();
    return;
  }

  fieldset.disabled = true;
  submitButton.disabled = true;
  submitButton.textContent = "Отправляем…";
  setStatus("Отправляем заявку.");

  let focusAfterSubmit = status;
  try {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(application),
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json();

    if (response.ok && result?.ok === true) {
      form.reset();
      setStatus("Заявка отправлена. Мы свяжемся с вами по указанному контакту.", "success");
    } else {
      const invalidField = response.status === 400 && result?.errors && showErrors(result.errors);
      if (invalidField) focusAfterSubmit = form.elements.namedItem(invalidField);
      if (!invalidField) focusAfterSubmit = submitButton;
      setStatus(result?.message || "Не удалось отправить заявку. Попробуйте ещё раз.", "error");
    }
  } catch {
    focusAfterSubmit = submitButton;
    setStatus("Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.", "error");
  } finally {
    fieldset.disabled = false;
    submitButton.disabled = false;
    submitButton.textContent = "Отправить заявку";
    updateGroupLabels();
    if (document.activeElement === document.body || form.contains(document.activeElement)) {
      focusAfterSubmit.focus({ preventScroll: true });
    }
  }
});
