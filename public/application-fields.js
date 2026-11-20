export const groups = Object.freeze({
  men: "Мужская",
  women: "Женская",
  children: "Детская",
});

export const formats = Object.freeze({
  online: "Онлайн",
  offline: "Офлайн",
});

export function normalizeApplication(input) {
  const read = (field) => {
    const value = input?.[field];
    return typeof value === "string" ? value.trim() : "";
  };

  return {
    name: read("name"),
    contact: read("contact"),
    group: read("group"),
    format: read("format"),
  };
}

function isContactValid(contact) {
  const telegram = /^(?:@|(?:https?:\/\/)?t\.me\/)[a-z\d][a-z\d_]{0,31}\/?$/i;
  if (telegram.test(contact)) return true;

  const digits = contact.replace(/\D/g, "");
  return /^\+?[\d\s().-]+$/.test(contact) && digits.length >= 7 && digits.length <= 15;
}

export function validateApplication({ name, contact, group, format }) {
  const errors = {};
  const forChild = group === "children";

  if (!name) {
    errors.name = forChild ? "Укажите имя родителя." : "Укажите ваше имя.";
  } else if (name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name) || !/\p{L}/u.test(name)) {
    errors.name = "Введите имя буквами. Максимум 80 символов.";
  }

  if (!contact) {
    errors.contact = forChild ? "Укажите контакт родителя." : "Укажите телефон или Telegram.";
  } else if (contact.length > 100 || /[\p{Cc}\p{Cf}]/u.test(contact) || !isContactValid(contact)) {
    errors.contact = "Введите номер телефона или Telegram в формате @имя_пользователя.";
  }

  if (!Object.hasOwn(groups, group)) errors.group = "Выберите группу.";
  if (!Object.hasOwn(formats, format)) errors.format = "Выберите предпочтительный формат.";

  return errors;
}
