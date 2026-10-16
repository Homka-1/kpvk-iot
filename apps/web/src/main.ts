import 'primeicons/primeicons.css';
import './theme/tokens.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { installPrimeVue } from './plugins/primevue';
import { router } from './router';

const app = createApp(App).use(createPinia()).use(router);
installPrimeVue(app);
app.mount('#app');
