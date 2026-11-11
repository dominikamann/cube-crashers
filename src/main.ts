import { t } from './i18n';

document.title = t('title');
document.querySelector('#app')!.textContent = t('title');
