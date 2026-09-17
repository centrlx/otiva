export const PAGE_SIZE = 15;
export const RELATED_PAGE_SIZE = 6;

export const CATEGORIES = [
  { id: 'electronics', label: 'Электроника', icon: 'smartphone' },
  { id: 'transport', label: 'Транспорт', icon: 'car' },
  { id: 'realestate', label: 'Недвижимость', icon: 'home' },
  { id: 'home', label: 'Дом и сад', icon: 'sofa' },
  { id: 'fashion', label: 'Одежда и обувь', icon: 'shirt' },
  { id: 'hobby', label: 'Хобби и отдых', icon: 'gamepad-2' },
  { id: 'services', label: 'Услуги', icon: 'wrench' },
  { id: 'job', label: 'Работа', icon: 'briefcase' },
  { id: 'animals', label: 'Животные', icon: 'paw-print' },
  { id: 'kids', label: 'Детские товары', icon: 'baby' },
  { id: 'other', label: 'Разное', icon: 'package' },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const CONDITIONS = [
  { id: 'new', label: 'Новое' },
  { id: 'used', label: 'Б/у' },
];

export const CONDITION_MAP = Object.fromEntries(CONDITIONS.map((c) => [c.id, c.label]));

export const CITIES = [
  'Алматы',
  'Астана',
  'Шымкент',
  'Караганда',
  'Актобе',
  'Тараз',
  'Павлодар',
  'Усть-Каменогорск',
  'Семей',
  'Атырау',
  'Костанай',
  'Кызылорда',
  'Уральск',
  'Петропавловск',
];

export const LISTING_STATUS = {
  active: 'Активно',
  reserved: 'Забронировано',
  sold: 'Продано',
  archived: 'В архиве',
};

export const CHAT_STATUS = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждено обеими сторонами',
  completed: 'Сделка завершена',
  cancelled: 'Отклонено',
};

export const HISTORY_STATUS = {
  completed: 'Завершено',
  cancelled: 'Отменено',
};

export const SORT_OPTIONS = [
  { id: 'date_desc', label: 'Сначала новые', field: 'createdAt', dir: 'desc' },
  { id: 'price_asc', label: 'Сначала дешевле', field: 'price', dir: 'asc' },
  { id: 'price_desc', label: 'Сначала дороже', field: 'price', dir: 'desc' },
  { id: 'rating_desc', label: 'По рейтингу', field: 'ratingAvg', dir: 'desc' },
];
