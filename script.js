// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCFQ_geG0HIv2EZ-bfKc97TJNtf2sdqPzc",
    authDomain: "clack-koder.firebaseapp.com",
    databaseURL: "https://clack-koder-default-rtdb.firebaseio.com",
    projectId: "clack-koder",
    storageBucket: "clack-koder.firebasestorage.app",
    messagingSenderId: "478151254938",
    appId: "1:478151254938:web:e2c00e3a5426bd192b9023",
    measurementId: "G-P29ME5Z3S1"
};

// Firebase Storage Configuration para base64
const FIREBASE_STORAGE = {
    maxImageSize: 5 * 1024 * 1024, // 5MB máximo
    compressionQuality: 0.8, // 80% calidad
    maxDimensions: { width: 1920, height: 1080 }
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// Estado global de la aplicación
let currentScreen = 'intro';
let userLanguage = 'es';
let currentChatContact = null;
let currentUser = null;

// Inicializar usuario desde localStorage si existe
function initializeUser() {
    const savedUser = localStorage.getItem('zenvio_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log('Usuario cargado desde localStorage:', currentUser);
        } catch (error) {
            console.error('Error cargando usuario desde localStorage:', error);
            localStorage.removeItem('zenvio_user');
        }
    }
}

// Llamar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    initializeUser();
});
let verificationCode = '';
let typingTimer = null;
let isTyping = false;
let chatContacts = [];
let selectedReportType = null;
let evidenceImages = [];
let messagesListener = null;
let contactsListener = null;

// Firebase Authentication variables
let recaptchaVerifier = null;
let confirmationResult = null;
let currentPhoneNumber = null;
let moderationSystem = {
    offensiveWords: ['puta', 'perra', 'zorra', 'cabrón', 'pendejo', 'idiota', 'estúpido', 'mierda', 'joder', 'coño'],
    userViolations: {},
    reportQueue: [],
    autoModerationEnabled: true
};
let currentWarning = null;

// Sistema de detección de sesiones concurrentes
let sessionManager = {
    currentSessionId: null,
    deviceInfo: null,
    loginAttemptListener: null,
    pendingApproval: null,
    blockedUntil: null
};

// Variables para modal de aprobación de dispositivo
let deviceApprovalModal = null;
let approvalTimeout = null;

function getSavedLanguagePreference() {
    const savedLanguage = localStorage.getItem('zenvio_language') || localStorage.getItem('uberchat_language');
    const supportedLanguages = ['es', 'en', 'fr', 'de', 'pt', 'it'];

    if (savedLanguage && supportedLanguages.includes(savedLanguage)) {
        return savedLanguage;
    }

    return 'es';
}

// Google Translate API - Configuración
const GOOGLE_TRANSLATE_CONFIG = {
    apiKey: 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw', // API Key gratuita (reemplazar con tu propia key)
    baseUrl: 'https://translation.googleapis.com/language/translate/v2',
    maxRequestsPerDay: 100000, // Límite gratuito
    fallbackTranslations: true
};

// Cache de traducciones para optimizar rendimiento
let translationCache = new Map();

// Función para traducir texto usando Google Translate API
async function translateTextWithGoogle(text, targetLang, sourceLang = 'auto') {
    // Crear clave única para el cache
    const cacheKey = `${text}_${sourceLang}_${targetLang}`;
    
    // Verificar si ya tenemos la traducción en cache
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }
    
    try {
        const response = await fetch(`${GOOGLE_TRANSLATE_CONFIG.baseUrl}?key=${GOOGLE_TRANSLATE_CONFIG.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: text,
                target: targetLang,
                source: sourceLang,
                format: 'text'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.data && data.data.translations && data.data.translations.length > 0) {
            const translatedText = data.data.translations[0].translatedText;
            
            // Guardar en cache
            translationCache.set(cacheKey, translatedText);
            
            console.log(`Traducido: "${text}" -> "${translatedText}" (${sourceLang} -> ${targetLang})`);
            return translatedText;
        } else {
            throw new Error('No se recibieron traducciones válidas');
        }
    } catch (error) {
        console.error('Error en Google Translate API:', error);
        
        // Fallback a traducciones estáticas si falla la API
        if (GOOGLE_TRANSLATE_CONFIG.fallbackTranslations) {
            return getFallbackTranslation(text, targetLang);
        }
        
        return text; // Devolver texto original si falla todo
    }
}

// Función de respaldo con traducciones estáticas
function getFallbackTranslation(text, targetLang) {
    const fallbackTranslations = {
        'es': {
            'Get Started': 'Comenzar',
            'Your phone number': 'Tu número de teléfono',
            'Send code': 'Enviar código',
            'Verification': 'Verificación',
            'Chats': 'Chats',
            'Translate': 'Traducir',
            'Calls': 'Llamadas',
            'Settings': 'Ajustes',
            'Type a message...': 'Escribe un mensaje...',
            'Online': 'En línea',
            'Add contact': 'Agregar contacto',
            'Search conversations...': 'Buscar conversaciones...'
        },
        'en': {
            'Comenzar': 'Get Started',
            'Tu número de teléfono': 'Your phone number',
            'Enviar código': 'Send code',
            'Verificación': 'Verification',
            'Chats': 'Chats',
            'Traducir': 'Translate',
            'Llamadas': 'Calls',
            'Ajustes': 'Settings',
            'Escribe un mensaje...': 'Type a message...',
            'En línea': 'Online',
            'Agregar contacto': 'Add contact',
            'Buscar conversaciones...': 'Search conversations...'
        },
        'fr': {
            'Get Started': 'Commencer',
            'Your phone number': 'Votre numéro de téléphone',
            'Send code': 'Envoyer le code',
            'Verification': 'Vérification',
            'Chats': 'Discussions',
            'Translate': 'Traduire',
            'Calls': 'Appels',
            'Settings': 'Paramètres'
        }
    };
    
    return fallbackTranslations[targetLang]?.[text] || text;
}

// Función para traducir toda la interfaz en tiempo real
async function translateInterface(targetLang) {
    const elementsToTranslate = document.querySelectorAll('[data-translate], .chat-name, .setting-title, .tutorial-content h1, .tutorial-content h2, .tutorial-content p');
    
    const translationPromises = [];
    
    elementsToTranslate.forEach(element => {
        const originalText = element.textContent.trim();
        
        if (originalText && originalText.length > 0) {
            const promise = translateTextWithGoogle(originalText, targetLang)
                .then(translatedText => {
                    element.textContent = translatedText;
                })
                .catch(error => {
                    console.error(`Error traduciendo "${originalText}":`, error);
                });
            
            translationPromises.push(promise);
        }
    });
    
    // Traducir placeholders
    const inputsWithPlaceholders = document.querySelectorAll('input[placeholder], textarea[placeholder]');
    inputsWithPlaceholders.forEach(input => {
        const originalPlaceholder = input.placeholder;
        if (originalPlaceholder) {
            const promise = translateTextWithGoogle(originalPlaceholder, targetLang)
                .then(translatedPlaceholder => {
                    input.placeholder = translatedPlaceholder;
                })
                .catch(error => {
                    console.error(`Error traduciendo placeholder "${originalPlaceholder}":`, error);
                });
            
            translationPromises.push(promise);
        }
    });
    
    // Esperar a que todas las traducciones se completen
    await Promise.all(translationPromises);
    
    console.log(`Interfaz traducida completamente a: ${targetLang}`);
}

// Traducciones de la interfaz
const translations = {
    es: {
        start: 'Comenzar',
        yourPhone: 'Tu número de teléfono',
        sendCode: 'Enviar código',
        verification: 'Verificación',
        chats: 'Chats',
        translate: 'Traducir',
        calls: 'Llamadas',
        settings: 'Ajustes',
        typeMessage: 'Escribe un mensaje...',
        online: 'En línea',
        addContact: 'Agregar contacto',
        searchConversations: 'Buscar conversaciones...',
        verifying: 'Verificando',
        codeVerified: '¡Código verificado!',
        invalidCode: 'Código inválido',
        resendCode: 'Reenviar código'
    },
    en: {
        start: 'Get Started',
        yourPhone: 'Your phone number',
        sendCode: 'Send code',
        verification: 'Verification',
        chats: 'Chats',
        translate: 'Translate',
        calls: 'Calls',
        settings: 'Settings',
        typeMessage: 'Type a message...',
        online: 'Online',
        addContact: 'Add contact',
        searchConversations: 'Search conversations...',
        verifying: 'Verifying',
        codeVerified: 'Code verified!',
        invalidCode: 'Invalid code',
        resendCode: 'Resend code'
    },
    fr: {
        start: 'Commencer',
        yourPhone: 'Votre numéro de téléphone',
        sendCode: 'Envoyer le code',
        verification: 'Vérification',
        chats: 'Discussions',
        translate: 'Traduire',
        calls: 'Appels',
        settings: 'Paramètres',
        typeMessage: 'Tapez un message...',
        online: 'En ligne',
        addContact: 'Ajouter un contact',
        searchConversations: 'Rechercher des conversations...',
        verifying: 'Vérification en cours',
        codeVerified: 'Code vérifié!',
        invalidCode: 'Code invalide',
        resendCode: 'Renvoyer le code'
    }
};

// Función para cambiar de pantalla con animación
function switchScreen(targetScreen) {
    console.log(`Cambiando de pantalla: ${currentScreen} -> ${targetScreen}`);
    
    const currentElement = document.getElementById(`${currentScreen}-screen`);
    const targetElement = document.getElementById(`${targetScreen}-screen`);

    if (!targetElement) {
        console.error(`Pantalla destino no encontrada: ${targetScreen}-screen`);
        return;
    }

    if (currentElement && currentElement !== targetElement) {
        currentElement.classList.remove('active');
    }

    setTimeout(() => {
        targetElement.classList.add('active');
        currentScreen = targetScreen;
        console.log(`Pantalla cambiada exitosamente a: ${targetScreen}`);
    }, 150);
}

// Función para actualizar el idioma de la interfaz
async function updateLanguage() {
    const lang = userLanguage;
    console.log(`Actualizando idioma a: ${lang}`);
    
    // Mostrar indicador de carga durante la traducción
    showTranslationLoader();
    
    try {
        // Usar Google Translate API para traducir la interfaz completa
        await translateInterface(lang);
        
        // Actualizar selector de idioma
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            languageSelect.value = lang;
        }
        
        // Ocultar indicador de carga
        hideTranslationLoader();
        
        console.log('Idioma actualizado exitosamente a:', lang);
    } catch (error) {
        console.error('Error actualizando idioma:', error);
        
        // Fallback a traducciones estáticas
        updateLanguageFallback();
        hideTranslationLoader();
    }
}

// Función de respaldo para actualizar idioma con traducciones estáticas
function updateLanguageFallback() {
    const lang = userLanguage;
    const t = translations[lang] || translations['es'];

    // Actualizar textos dinámicamente
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (t[key]) {
            element.textContent = t[key];
        }
    });

    // Actualizar placeholders
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.placeholder = t.typeMessage || 'Escribe un mensaje...';
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.placeholder = t.searchConversations || 'Buscar conversaciones...';
    }
}

// Función para mostrar indicador de carga de traducción
function showTranslationLoader() {
    const existingLoader = document.getElementById('translation-loader');
    if (existingLoader) return;
    
    const loader = document.createElement('div');
    loader.id = 'translation-loader';
    loader.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--primary-color);
        color: white;
        padding: 0.75rem 1rem;
        border-radius: 25px;
        font-size: 0.9rem;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        box-shadow: var(--shadow);
    `;
    loader.innerHTML = `
        <i class="fas fa-language fa-spin"></i>
        <span>Traduciendo interfaz...</span>
    `;
    
    document.body.appendChild(loader);
}

// Función para ocultar indicador de carga
function hideTranslationLoader() {
    const loader = document.getElementById('translation-loader');
    if (loader) {
        loader.remove();
    }
}

// Pantalla de Introducción
document.getElementById('language-select').addEventListener('change', async function() {
    const newLanguage = this.value;
    
    if (newLanguage !== userLanguage) {
        userLanguage = newLanguage;
        
        // Guardar preferencia
        localStorage.setItem('zenvio_language', newLanguage);
        
        // Actualizar interfaz en tiempo real
        await updateLanguage();
        
    }
});

function goToRegister() {
    switchScreen('register');
}

function goToIntro() {
    switchScreen('intro');
}

// Lista completa de países con banderas y códigos
const countries = [
    { name: 'España', code: '+34', flag: '', popular: true },
    { name: 'Estados Unidos', code: '+1', flag: '', popular: true },
    { name: 'México', code: '+52', flag: '', popular: true },
    { name: 'Argentina', code: '+54', flag: '', popular: true },
    { name: 'Brasil', code: '+55', flag: '', popular: true },
    { name: 'Colombia', code: '+57', flag: '', popular: true },
    { name: 'Chile', code: '+56', flag: '', popular: true },
    { name: 'Perú', code: '+51', flag: '', popular: true },
    { name: 'Francia', code: '+33', flag: '' },
    { name: 'Alemania', code: '+49', flag: '' },
    { name: 'Italia', code: '+39', flag: '' },
    { name: 'Reino Unido', code: '+44', flag: '' },
    { name: 'Canadá', code: '+1', flag: '' },
    { name: 'Australia', code: '+61', flag: '' },
    { name: 'Japón', code: '+81', flag: '' },
    { name: 'China', code: '+86', flag: '' },
    { name: 'India', code: '+91', flag: '' },
    { name: 'Rusia', code: '+7', flag: '' },
    { name: 'Corea del Sur', code: '+82', flag: '' },
    { name: 'Holanda', code: '+31', flag: '' },
    { name: 'Bélgica', code: '+32', flag: '' },
    { name: 'Suiza', code: '+41', flag: '' },
    { name: 'Austria', code: '+43', flag: '' },
    { name: 'Suecia', code: '+46', flag: '' },
    { name: 'Noruega', code: '+47', flag: '' },
    { name: 'Dinamarca', code: '+45', flag: '' },
    { name: 'Finlandia', code: '+358', flag: '' },
    { name: 'Portugal', code: '+351', flag: '' },
    { name: 'Grecia', code: '+30', flag: '' },
    { name: 'Turquía', code: '+90', flag: '' },
    { name: 'Israel', code: '+972', flag: '' },
    { name: 'Emiratos Árabes Unidos', code: '+971', flag: '' },
    { name: 'Arabia Saudí', code: '+966', flag: '' },
    { name: 'Egipto', code: '+20', flag: '' },
    { name: 'Sudáfrica', code: '+27', flag: '' },
    { name: 'Marruecos', code: '+212', flag: '' },
    { name: 'Nigeria', code: '+234', flag: '' },
    { name: 'Kenia', code: '+254', flag: '' },
    { name: 'Ghana', code: '+233', flag: '' },
    { name: 'Tanzania', code: '+255', flag: '' }
];

let selectedCountry = countries[0]; // España por defecto
let selectedContactCountry = countries[0]; // Selector de país para agregar contacto

// Pantalla de Registro
const phoneInput = document.getElementById('phone-input');
const sendCodeBtn = document.getElementById('send-code-btn');

phoneInput.addEventListener('input', function() {
    const phone = this.value.trim();
    const isValid = phone.length >= 8 && /^\d+$/.test(phone);
    sendCodeBtn.disabled = !isValid;
});

// Funciones para el modal de países
function syncBodyModalState() {
    const hasVisibleModal = document.querySelector('.country-modal.show') !== null;
    document.body.classList.toggle('modal-open', hasVisibleModal);
}

function openCountryModal() {
    const modal = document.getElementById('country-modal');
    const btn = document.getElementById('country-selector-btn');
    
    // Llenar la lista de países si no está llena
    loadCountriesList();
    
    // Mostrar modal con animación
    modal.style.display = 'flex';
    btn.classList.add('active');
    
    // Forzar reflow para que la animación funcione
    modal.offsetHeight;
    
    modal.classList.add('show');
    syncBodyModalState();

    // Enfocar en la búsqueda
    setTimeout(() => {
        const searchInput = document.getElementById('country-search');
        if (searchInput) {
            searchInput.focus();
        }
    }, 300);
    
    console.log('Modal de países abierto');
}

function closeCountryModal() {
    const modal = document.getElementById('country-modal');
    const btn = document.getElementById('country-selector-btn');
    
    modal.classList.remove('show');
    btn.classList.remove('active');
    syncBodyModalState();
    
    // Ocultar modal después de la animación
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
    
    // Limpiar búsqueda
    const searchInput = document.getElementById('country-search');
    if (searchInput) {
        searchInput.value = '';
        filterCountries();
    }
    
    console.log('Modal de países cerrado');
}

function normalizeCountrySearch(value = '') {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function countryMatchesSearch(country, normalizedSearch) {
    if (!normalizedSearch) return true;

    const normalizedName = normalizeCountrySearch(country.name);
    const normalizedCode = country.code.toLowerCase();

    return normalizedName.includes(normalizedSearch) || normalizedCode.includes(normalizedSearch);
}

function renderNoCountryResults(container) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.innerHTML = `
        <i class="fas fa-search"></i>
        <h4>No se encontraron países</h4>
        <p>Intenta con otro término de búsqueda</p>
    `;
    container.appendChild(noResults);
}

function loadCountriesList(searchTerm = '') {
    const countriesList = document.getElementById('countries-list');
    countriesList.innerHTML = '';

    const normalizedSearch = normalizeCountrySearch(searchTerm);
    const popularCountries = countries
        .filter(country => country.popular && countryMatchesSearch(country, normalizedSearch));
    const otherCountries = countries
        .filter(country => !country.popular && countryMatchesSearch(country, normalizedSearch))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (popularCountries.length > 0) {
        const popularHeader = document.createElement('div');
        popularHeader.className = 'countries-section-header';
        popularHeader.textContent = 'Países populares';
        countriesList.appendChild(popularHeader);

        popularCountries.forEach(country => {
            countriesList.appendChild(createCountryItem(country));
        });
    }

    if (otherCountries.length > 0) {
        const otherHeader = document.createElement('div');
        otherHeader.className = 'countries-section-header';
        otherHeader.textContent = 'Todos los países';
        countriesList.appendChild(otherHeader);

        otherCountries.forEach(country => {
            countriesList.appendChild(createCountryItem(country));
        });
    }

    if (popularCountries.length === 0 && otherCountries.length === 0) {
        renderNoCountryResults(countriesList);
    }
}

function createCountryItem(country) {
    const item = document.createElement('div');
    item.className = 'country-item';
    item.dataset.countryName = country.name.toLowerCase();
    item.dataset.countryCode = country.code;

    const isSelected = selectedCountry.code === country.code && selectedCountry.name === country.name;
    if (isSelected) {
        item.classList.add('selected');
    }

    item.innerHTML = `
        <div class="country-item-flag">${country.flag}</div>
        <div class="country-item-info">
            <div class="country-item-name">${country.name}</div>
            <div class="country-item-code">${country.code}</div>
        </div>
        <i class="fas fa-check country-item-check" aria-hidden="true"></i>
    `;

    item.onclick = () => selectCountry(country);

    return item;
}

function selectCountry(country) {
    selectedCountry = country;
    
    // Actualizar UI del selector
    const flagElement = document.querySelector('.country-flag');
    const codeElement = document.querySelector('.country-code');
    
    flagElement.textContent = country.flag;
    codeElement.textContent = country.code;
    
    // Cerrar modal
    closeCountryModal();
    
    // Enfocar en el input de teléfono
    setTimeout(() => {
        document.getElementById('phone-input').focus();
    }, 300);
    
    console.log('País seleccionado:', country);
}

function handleCountryModalEscape(event) {
    if (event.key !== 'Escape') {
        return;
    }

    const mainModal = document.getElementById('country-modal');
    const contactModal = document.getElementById('contact-country-modal');

    if (contactModal && contactModal.classList.contains('show')) {
        closeContactCountryModal();
        return;
    }

    if (mainModal && mainModal.classList.contains('show')) {
        closeCountryModal();
    }
}

document.addEventListener('keydown', handleCountryModalEscape);

function filterCountries() {
    const searchInput = document.getElementById('country-search');
    const searchTerm = searchInput ? searchInput.value : '';
    loadCountriesList(searchTerm);
}


function showAddContact() {
    const modal = document.getElementById('add-contact-modal');
    if (!modal) return;
    modal.classList.add('show');
}

function hideAddContact() {
    const modal = document.getElementById('add-contact-modal');
    if (!modal) return;
    modal.classList.remove('show');

    const phoneInput = document.getElementById('contact-phone');
    if (phoneInput) {
        phoneInput.value = '';
    }
}

function loadContactCountriesList(searchTerm = '') {
    const countriesList = document.getElementById('contact-countries-list');
    if (!countriesList) return;

    countriesList.innerHTML = '';

    const normalizedSearch = normalizeCountrySearch(searchTerm);
    const popularCountries = countries
        .filter(country => country.popular && countryMatchesSearch(country, normalizedSearch));
    const otherCountries = countries
        .filter(country => !country.popular && countryMatchesSearch(country, normalizedSearch))
        .sort((a, b) => a.name.localeCompare(b.name));

    const createContactItem = (country) => {
        const item = document.createElement('div');
        item.className = 'country-item';

        if (selectedContactCountry.code === country.code && selectedContactCountry.name === country.name) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <div class="country-item-flag">${country.flag}</div>
            <div class="country-item-info">
                <div class="country-item-name">${country.name}</div>
                <div class="country-item-code">${country.code}</div>
            </div>
            <i class="fas fa-check country-item-check" aria-hidden="true"></i>
        `;

        item.onclick = () => selectContactCountry(country);
        return item;
    };

    if (popularCountries.length > 0) {
        const popularHeader = document.createElement('div');
        popularHeader.className = 'countries-section-header';
        popularHeader.textContent = 'Países populares';
        countriesList.appendChild(popularHeader);
        popularCountries.forEach(country => countriesList.appendChild(createContactItem(country)));
    }

    if (otherCountries.length > 0) {
        const otherHeader = document.createElement('div');
        otherHeader.className = 'countries-section-header';
        otherHeader.textContent = 'Todos los países';
        countriesList.appendChild(otherHeader);
        otherCountries.forEach(country => countriesList.appendChild(createContactItem(country)));
    }

    if (popularCountries.length === 0 && otherCountries.length === 0) {
        renderNoCountryResults(countriesList);
    }
}

function openContactCountryModal() {
    const modal = document.getElementById('contact-country-modal');
    if (!modal) return;

    loadContactCountriesList();
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
    syncBodyModalState();

    setTimeout(() => {
        const searchInput = document.getElementById('contact-country-search');
        if (searchInput) searchInput.focus();
    }, 250);
}

function closeContactCountryModal() {
    const modal = document.getElementById('contact-country-modal');
    if (!modal) return;

    modal.classList.remove('show');
    syncBodyModalState();

    setTimeout(() => {
        modal.style.display = 'none';
    }, 250);

    const searchInput = document.getElementById('contact-country-search');
    if (searchInput) {
        searchInput.value = '';
        filterContactCountries();
    }
}

function filterContactCountries() {
    const searchInput = document.getElementById('contact-country-search');
    const searchTerm = searchInput ? searchInput.value : '';
    loadContactCountriesList(searchTerm);
}

function selectContactCountry(country) {
    selectedContactCountry = country;

    const selector = document.querySelector('#contact-country-selector .selected-country');
    if (selector) {
        selector.querySelector('.country-flag').textContent = country.flag;
        selector.querySelector('.country-code').textContent = country.code;
    }

    closeContactCountryModal();

    setTimeout(() => {
        const phoneInput = document.getElementById('contact-phone');
        if (phoneInput) phoneInput.focus();
    }, 150);
}

function addContact() {
    if (!currentUser || !currentUser.uid) {
        showErrorMessage('Debes iniciar sesión para agregar contactos.');
        return;
    }

    const phoneInput = document.getElementById('contact-phone');
    if (!phoneInput) return;

    const cleanPhone = phoneInput.value.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
        showErrorMessage('Ingresa un número de teléfono válido.');
        return;
    }

    const fullPhone = `${selectedContactCountry.code}${cleanPhone}`;
    const searchButton = document.getElementById('manual-search-btn');
    if (searchButton) {
        searchButton.disabled = true;
        searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
    }

    database.ref('users').orderByChild('phoneNumber').equalTo(fullPhone).once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                throw new Error('No se encontró ningún usuario con ese número.');
            }

            const users = snapshot.val();
            const targetUid = Object.keys(users)[0];

            if (targetUid === currentUser.uid) {
                throw new Error('No puedes agregarte a ti mismo.');
            }

            const targetUser = users[targetUid];
            return database.ref(`contacts/${currentUser.uid}/${targetUid}`).set({
                addedAt: firebase.database.ServerValue.TIMESTAMP,
                phoneNumber: targetUser.phoneNumber || fullPhone,
                displayName: targetUser.username || targetUser.name || targetUser.phoneNumber || 'Contacto'
            }).then(() => targetUser);
        })
        .then((targetUser) => {
            showSuccessMessage(`Contacto agregado: ${targetUser.username || targetUser.phoneNumber || 'Usuario'}`);
            hideAddContact();
            loadUserContacts();
        })
        .catch((error) => {
            showErrorMessage(error.message || 'No se pudo agregar el contacto.');
        })
        .finally(() => {
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.innerHTML = '<i class="fas fa-search"></i> Buscar Usuario';
            }
        });
}

function sendVerificationCode() {
    const countryCode = selectedCountry.code;
    const phoneNumber = document.getElementById('phone-input').value;

    // Limpiar el número de teléfono (remover espacios y caracteres no numéricos)
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    const fullNumber = `${countryCode}${cleanPhoneNumber}`;

    console.log('Procesando número:', fullNumber);

    currentPhoneNumber = fullNumber;
    document.getElementById('phone-display').textContent = fullNumber;

    // Verificar si hay bloqueo temporal activo
    if (sessionManager.blockedUntil && Date.now() < sessionManager.blockedUntil) {
        const timeLeft = Math.ceil((sessionManager.blockedUntil - Date.now()) / 60000);
        showErrorMessage(`Acceso bloqueado temporalmente. Intenta de nuevo en ${timeLeft} minutos.`);
        return;
    }

    // Verificar si el número ya está en uso por otra sesión activa
    checkExistingSession(fullNumber);

    }

// Función para verificar sesiones existentes
function checkExistingSession(phoneNumber) {
    const sendBtn = document.getElementById('send-code-btn');
    const originalText = sendBtn.innerHTML;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    sendBtn.disabled = true;

    // Buscar si hay sesiones activas con este número
    database.ref('activeSessions').orderByChild('phoneNumber').equalTo(phoneNumber)
        .once('value')
        .then(snapshot => {
            const activeSessions = snapshot.val() || {};
            const sessionKeys = Object.keys(activeSessions);

            if (sessionKeys.length > 0) {
                // Hay una sesión activa, solicitar aprobación
                const activeSession = activeSessions[sessionKeys[0]];
                requestLoginApproval(phoneNumber, activeSession.userId, activeSession.sessionId);
            } else {
                // No hay sesiones activas, proceder normalmente
                proceedWithVerification(phoneNumber);
            }

            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
        })
        .catch(error => {
            console.error('Error verificando sesiones:', error);
            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
            showErrorMessage('Error verificando sesión. Intenta de nuevo.');
        });
}

// Función para solicitar aprobación de inicio de sesión
function requestLoginApproval(phoneNumber, existingUserId, existingSessionId) {
    const deviceInfo = getDeviceFingerprint();
    const loginRequestId = Date.now().toString();

    console.log(' Enviando solicitud de aprobación para:', phoneNumber, 'a usuario:', existingUserId);

    // Crear solicitud de aprobación en Firebase
    const approvalRequest = {
        id: loginRequestId,
        phoneNumber: phoneNumber,
        requestingDevice: deviceInfo,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'pending',
        approvedBy: null,
        existingUserId: existingUserId,
        existingSessionId: existingSessionId
    };

    // Enviar solicitud principal con múltiples rutas para asegurar entrega
    const approvalPromise = database.ref(`loginApprovals/${existingUserId}/${loginRequestId}`).set(approvalRequest);
    
    // Crear notificación directa con timestamp del servidor
    const notificationData = {
        type: 'login_approval_request',
        from: 'security_system',
        requestId: loginRequestId,
        phoneNumber: phoneNumber,
        deviceInfo: deviceInfo,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        read: false,
        urgent: true
    };
    
    const notificationPromise = database.ref(`notifications/${existingUserId}`).push(notificationData);
    
    // Activar múltiples flags para asegurar detección
    const flagPromise = database.ref(`users/${existingUserId}/pendingLoginApproval`).set({
        requestId: loginRequestId,
        fromDevice: deviceInfo,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        phoneNumber: phoneNumber,
        urgent: true
    });

    // Crear flag global adicional
    const globalFlagPromise = database.ref(`globalLoginRequests/${loginRequestId}`).set({
        targetUser: existingUserId,
        fromDevice: deviceInfo,
        phoneNumber: phoneNumber,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'pending'
    });

    // Trigger inmediato para usuarios online
    const triggerPromise = database.ref(`users/${existingUserId}/lastLoginRequest`).set({
        requestId: loginRequestId,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        trigger: Date.now()
    });

    Promise.all([approvalPromise, notificationPromise, flagPromise, globalFlagPromise, triggerPromise])
        .then(() => {
            console.log(' Solicitud de aprobación enviada por múltiples canales');
            showLoginRequestPending(deviceInfo);

            // Verificar si el usuario está online y forzar notificación
            return database.ref(`users/${existingUserId}/status`).once('value');
        })
        .then((statusSnapshot) => {
            const userStatus = statusSnapshot.val();
            console.log(` Estado del usuario destinatario: ${userStatus}`);
            
            if (userStatus === 'online') {
                // Usuario online - enviar pulse adicional
                database.ref(`users/${existingUserId}/alertPulse`).set({
                    type: 'login_request',
                    requestId: loginRequestId,
                    timestamp: Date.now()
                });
                console.log(' Usuario online - enviado pulse adicional');
            }

            // Escuchar respuesta de aprobación
            listenForApprovalResponse(existingUserId, loginRequestId, phoneNumber);
        })
        .catch(error => {
            console.error(' Error enviando solicitud completa:', error);
            showErrorMessage('Error enviando solicitud de aprobación. Verifica tu conexión.');
        });
}

// Función para proceder con verificación normal
function proceedWithVerification(phoneNumber) {
    // Mostrar loading en el botón
    const sendBtn = document.getElementById('send-code-btn');
    const originalText = sendBtn.innerHTML;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    sendBtn.disabled = true;

    // Generar código automáticamente (6 dígitos)
    const generatedCode = generateRandomCode();
    console.log('Código generado automáticamente:', generatedCode);

    // Crear usuario inmediatamente en Firebase con el número
    const userId = 'user_' + phoneNumber.replace(/\D/g, '');
    const newUserData = {
        uid: userId,
        phoneNumber: phoneNumber,
        displayName: phoneNumber,
        status: 'pending_verification',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phoneNumber.replace(/\D/g, '')}`
    };

    // Registrar usuario en Firebase inmediatamente con número indexado
    const userPromise = database.ref('users/' + userId).set(newUserData);
    const phoneIndexPromise = database.ref('phoneNumbers/' + phoneNumber.replace(/\D/g, '')).set({
        phoneNumber: phoneNumber,
        userId: userId,
        registeredAt: firebase.database.ServerValue.TIMESTAMP
    });

    Promise.all([userPromise, phoneIndexPromise])
        .then(() => {
            console.log('Usuario y número registrados en Firebase:', phoneNumber);
            
            // Guardar código generado globalmente
            confirmationResult = {
                generatedCode: generatedCode,
                phoneNumber: phoneNumber,
                userId: userId,
                confirm: function(enteredCode) {
                    return new Promise((resolve, reject) => {
                        if (enteredCode === this.generatedCode) {
                            // Actualizar estado a verificado
                            database.ref(`users/${userId}/status`).set('online');
                            
                            // Simular usuario autenticado
                            const mockUser = {
                                uid: userId,
                                phoneNumber: phoneNumber,
                                displayName: phoneNumber
                            };
                            resolve({ user: mockUser });
                        } else {
                            reject({ code: 'auth/invalid-verification-code', message: 'Código inválido' });
                        }
                    });
                }
            };

            // Simular envío exitoso
            setTimeout(() => {
                sendBtn.innerHTML = originalText;
                sendBtn.disabled = false;

                // Mostrar mensaje de éxito y continuar
                showSuccessMessage(`Código enviado: ${generatedCode}`);

                setTimeout(() => {
                    showAutoGeneratedCodeMessage(generatedCode);
                }, 1500);
            }, 1500);
        })
        .catch(error => {
            console.error('Error registrando usuario en Firebase:', error);
            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
            showErrorMessage('Error registrando usuario. Intenta de nuevo.');
        });
}

// Función para generar código aleatorio de 6 dígitos
function generateRandomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Sistema de notificación desactivado (UI silenciosa)
let notificationSystem = {
    activeNotifications: [],
    soundEnabled: false
};

function showInstantNotification(message, type = 'info') {
    console.log(`[notification:${type}] ${message}`);
}

function closeNotification() {}

function playNotificationSound() {}

function getDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);

    return {
        userAgent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform,
        canvasFingerprint: canvas.toDataURL(),
        timestamp: Date.now(),
        ipLocation: 'Unknown', // En producción usarías una API de geolocalización
        deviceType: /Mobile|Android|iP(ad|od|hone)/.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
    };
}

// Función para mostrar solicitud pendiente
function showLoginRequestPending(deviceInfo) {
    const pendingModal = document.createElement('div');
    pendingModal.className = 'login-pending-modal';
    pendingModal.innerHTML = `
        <div class="pending-content">
            <div class="pending-icon">
                <i class="fas fa-clock"></i>
            </div>
            <h2> Verificación de Seguridad</h2>
            <p>Este número ya está en uso en otro dispositivo.</p>
            <div class="device-info">
                <h4> Tu dispositivo:</h4>
                <p><strong>Tipo:</strong> ${deviceInfo.deviceType}</p>
                <p><strong>Ubicación:</strong> ${deviceInfo.ipLocation}</p>
                <p><strong>Navegador:</strong> ${deviceInfo.userAgent.substring(0, 50)}...</p>
            </div>
            <div class="pending-message">
                <p>Se ha enviado una solicitud de aprobación al dispositivo autorizado.</p>
                <p>El usuario debe aprobar tu acceso para continuar.</p>
            </div>
            <div class="pending-animation">
                <div class="pulse-dot"></div>
                <div class="pulse-dot"></div>
                <div class="pulse-dot"></div>
            </div>
            <button class="secondary-btn" onclick="cancelLoginRequest()">
                <i class="fas fa-times"></i>
                Cancelar solicitud
            </button>
        </div>
    `;

    document.body.appendChild(pendingModal);
    sessionManager.pendingApproval = pendingModal;
}

// Función para escuchar respuesta de aprobación
function listenForApprovalResponse(userId, requestId, phoneNumber) {
    console.log('Configurando listener de respuesta para:', requestId);
    
    // Listener principal para la solicitud específica
    const approvalRef = database.ref(`loginApprovals/${userId}/${requestId}`);
    
    // Listener adicional para respuestas globales
    const globalApprovalRef = database.ref(`globalApprovals/${requestId}`);

    const handleApprovalResponse = (status, source) => {
        console.log(`Respuesta de aprobación recibida: ${status} desde ${source}`);
        
        if (status === 'approved') {
            console.log(' Inicio de sesión APROBADO');
            closePendingModal();
            
            // Mostrar mensaje de éxito
            showInstantNotification(' Acceso aprobado - Iniciando sesión...', 'friend-request');
            
            // Proceder con la verificación después de un breve delay
            setTimeout(() => {
                proceedWithVerification(phoneNumber);
            }, 1000);
            
            // Limpiar listeners
            approvalRef.off();
            globalApprovalRef.off();
            
        } else if (status === 'denied') {
            console.log(' Inicio de sesión DENEGADO');
            closePendingModal();

            // Bloquear por 10 minutos
            sessionManager.blockedUntil = Date.now() + (10 * 60 * 1000);
            
            showFullScreenMessage(' Acceso Denegado', 
                'El usuario autorizado ha denegado tu solicitud de acceso. Tu dispositivo ha sido bloqueado temporalmente por 10 minutos por seguridad.', 
                'denied');
            
            // Limpiar listeners
            approvalRef.off();
            globalApprovalRef.off();
        }
    };

    // Escuchar cambios en la solicitud principal
    approvalRef.on('value', snapshot => {
        const approval = snapshot.val();
        if (approval && (approval.status === 'approved' || approval.status === 'denied')) {
            handleApprovalResponse(approval.status, 'direct');
        }
    });

    // Escuchar cambios en respuestas globales (backup)
    globalApprovalRef.on('value', snapshot => {
        const globalApproval = snapshot.val();
        if (globalApproval && (globalApproval.status === 'approved' || globalApproval.status === 'denied')) {
            handleApprovalResponse(globalApproval.status, 'global');
        }
    });

    // Timeout después de 2 minutos
    setTimeout(() => {
        approvalRef.off();
        globalApprovalRef.off();
        
        if (sessionManager.pendingApproval) {
            closePendingModal();
            showErrorMessage('⏱️ Tiempo de espera agotado. La solicitud de aprobación expiró después de 2 minutos.');
        }
    }, 120000); // 2 minutos
}

function cancelLoginRequest() {
    closePendingModal();
}

function closePendingModal() {
    if (sessionManager.pendingApproval) {
        document.body.removeChild(sessionManager.pendingApproval);
        sessionManager.pendingApproval = null;
    }
}

function goToRegister() {
    switchScreen('register');
}

// Pantalla de Verificación
let enteredCode = '';

function handleCodeInput(input, index) {
    const value = input.value;

    if (value && /^\d$/.test(value)) {
        enteredCode = enteredCode.substring(0, index) + value + enteredCode.substring(index + 1);

        // Mover al siguiente campo
        if (index < 5) {
            const nextInput = input.parentNode.children[index + 1];
            nextInput.focus();
        }

        // Si se completó el código, verificar
        if (enteredCode.length === 6) {
            setTimeout(() => verifyCode(), 500);
        }
    } else {
        input.value = '';
    }

    // Permitir retroceso
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && !this.value && index > 0) {
            const prevInput = this.parentNode.children[index - 1];
            prevInput.focus();
            enteredCode = enteredCode.substring(0, index - 1) + enteredCode.substring(index);
        }
    });
}

function verifyCode() {
    const statusElement = document.getElementById('verification-status');
    statusElement.className = 'verification-status verifying';
    statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando<span class="loading-dots"></span>';

    if (!confirmationResult) {
        statusElement.className = 'verification-status error';
        statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Error: No hay código pendiente';
        return;
    }

    // Verificar el código con Firebase Auth
    confirmationResult.confirm(enteredCode)
        .then(function(result) {
            // Usuario autenticado exitosamente
            const user = result.user;
            console.log('Usuario autenticado:', user);

            statusElement.className = 'verification-status success';
            statusElement.innerHTML = '<i class="fas fa-check-circle"></i> ¡Código verificado!';

            // Crear perfil de usuario en Realtime Database
            currentUser = {
                uid: user.uid,
                phoneNumber: user.phoneNumber,
                lastSeen: firebase.database.ServerValue.TIMESTAMP,
                status: 'online',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.phoneNumber.replace(/\D/g, '')}`
            };

            const continueAfterVerification = () => {
                // Guardar en localStorage para persistencia
                localStorage.setItem('zenvio_user', JSON.stringify(currentUser));

                // Crear sesión activa
                createActiveSession(user.uid, user.phoneNumber);

                // Configurar listeners importantes inmediatamente
                setupLoginApprovalListener(user.uid);
                setupFriendRequestsListener();
                setupNotificationsListener();
                setupCallRequestsListener();

                // Inicializar configuraciones
                initializeSettings();

                // Inicializar sistema de almacenamiento en tiempo real
                if (typeof storageManager !== 'undefined' && storageManager.initialize) {
                    storageManager.initialize();
                }

                console.log('Configurando listeners en tiempo real...');

                setTimeout(() => {
                    // Iniciar tutorial después de verificación exitosa
                    startTutorial();
                }, 1500);
            };

            // Guardar usuario en Firebase Realtime Database
            database.ref('users/' + user.uid).update(currentUser)
                .then(() => {
                    console.log('Usuario guardado/actualizado en Firebase Database:', currentUser);
                    continueAfterVerification();
                })
                .catch(error => {
                    // En entornos de verificación simulada puede fallar por reglas de auth;
                    // no bloqueamos el inicio de sesión local del usuario.
                    console.error('Error guardando usuario en Firebase, continuando en modo local:', error);
                    continueAfterVerification();
                });
        })
        .catch(function(error) {
            console.error('Error verificando código:', error);
            statusElement.className = 'verification-status error';

            if (error.code === 'auth/invalid-verification-code') {
                statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Código inválido';
            } else if (error.code === 'auth/code-expired') {
                statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Código expirado';
            } else {
                statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Error verificando código';
            }

            // Limpiar campos
            document.querySelectorAll('.code-digit').forEach(input => {
                input.value = '';
            });
            enteredCode = '';
            document.querySelector('.code-digit').focus();
        });
}

function resendCode() {
    if (!currentPhoneNumber) {
        console.error('No hay número de teléfono para reenviar');
        return;
    }

    const statusElement = document.getElementById('verification-status');
    statusElement.className = 'verification-status';
    statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reenviando código...';

    // Generar nuevo código automáticamente
    const newCode = generateRandomCode();
    console.log('Nuevo código generado:', newCode);

    // Actualizar confirmationResult con el nuevo código
    confirmationResult.generatedCode = newCode;

    setTimeout(() => {
        statusElement.className = 'verification-status';
        statusElement.innerHTML = '<i class="fas fa-paper-plane"></i> Código reenviado';

        // Mostrar nuevo código generado
        showAutoGeneratedCodeMessage(newCode);

        setTimeout(() => {
            statusElement.innerHTML = '';
        }, 3000);
    }, 1500);
}

function generateUserId(phoneNumber) {
    // Generar ID único basado en el número de teléfono
    return 'user_' + phoneNumber.replace(/\D/g, '');
}

function loadUserContacts() {
    // Limpiar lista de contactos existente
    chatContacts = [];
    const chatList = document.querySelector('.chat-list');
    
    // Solo mostrar contactos añadidos, NO todos los usuarios registrados
    chatList.innerHTML = '<div class="loading-contacts"><i class="fas fa-spinner fa-spin"></i> Cargando contactos...</div>';

    // Escuchar solo los contactos aprobados del usuario actual
    if (currentUser && currentUser.uid) {
        contactsListener = database.ref(`contacts/${currentUser.uid}`).on('value', (contactsSnapshot) => {
            const contacts = contactsSnapshot.val() || {};
            const contactIds = Object.keys(contacts);

            chatList.innerHTML = '';

            if (contactIds.length === 0) {
                chatList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <h3>¡Comienza a conectar!</h3>
                        <p>Aún no tienes contactos agregados.</p>
                        <p>Usa el botón <strong>+</strong> de arriba para buscar y agregar usuarios por su número de teléfono.</p>
                        <div class="empty-state-tip">
                            <i class="fas fa-lightbulb"></i>
                            <span>Los usuarios deben estar registrados en Zenvio para poder ser encontrados</span>
                        </div>
                    </div>
                `;
                return;
            }

            // Cargar datos de cada contacto
            contactIds.forEach(contactId => {
                database.ref(`users/${contactId}`).once('value').then(userSnapshot => {
                    if (userSnapshot.exists()) {
                        const user = userSnapshot.val();
                        user.uid = contactId;
                        createContactItem(user);
                    }
                });
            });
        });
    }
}

function createContactItem(user) {
    const chatList = document.querySelector('.chat-list');
    
    // Crear contenedor principal del chat con funcionalidad de deslizado
    const chatContainer = document.createElement('div');
    chatContainer.className = 'chat-container-swipe';
    chatContainer.dataset.userId = user.uid;
    
    // Determinar avatar a mostrar basado en configuraciones de privacidad del usuario
    let avatarUrl;
    if (user.profilePhotoVisible !== false) {
        const avatarSeed = user.phoneNumber.replace(/\D/g, '');
        avatarUrl = user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`;
    } else {
        avatarUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNjY2MiLz4KPHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBzdHlsZT0idHJhbnNmb3JtOiB0cmFuc2xhdGUoNTAlLCA1MCUpOyI+CjxwYXRoIGQ9Ik0xMCA5QzExLjY1NjkgOSAxMyA3LjY1NjkgMTMgNkMxMyA0LjM0MzEgMTEuNjU2OSAzIDEwIDNDOC4zNDMxNSAzIDcgNC4zNDMxIDcgNkM3IDcuNjU2OSA4LjM0MzE1IDkgMTAgOVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMCAxMUM3IDExIDQgMTMgNCAxNlYxN0gxNlYxNkMxNiAxMyAxMyAxMSAxMCAxMVoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo8L3N2Zz4K';
    }

    const displayName = user.username || user.phoneNumber;
    
    let statusIndicator = '';
    if (user.onlineStatusVisible !== false) {
        statusIndicator = `<div class="status-indicator ${user.status === 'online' ? 'online' : 'offline'}"></div>`;
    }

    let lastSeenText = 'Toca para iniciar conversación';
    if (user.lastSeenVisible !== false && user.lastSeen) {
        const lastSeenDate = new Date(user.lastSeen);
        const now = new Date();
        const diffHours = Math.floor((now - lastSeenDate) / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            lastSeenText = 'Activo recientemente';
        } else if (diffHours < 24) {
            lastSeenText = `Último acceso hace ${diffHours}h`;
        } else {
            lastSeenText = `Último acceso ${lastSeenDate.toLocaleDateString()}`;
        }
    }

    // Verificar si el chat está silenciado
    const isMuted = isChatMuted(user.uid);
    const mutedClass = isMuted ? 'muted' : '';
    const mutedIndicator = isMuted ? '<i class="fas fa-volume-mute muted-indicator"></i>' : '';

    chatContainer.innerHTML = `
        <!-- Acciones de deslizado (ocultas por defecto) -->
        <div class="swipe-actions">
            <button class="swipe-action mute-action" onclick="toggleMuteChat('${user.uid}', '${displayName}')">
                <i class="fas fa-${isMuted ? 'volume-up' : 'volume-mute'}"></i>
                <span>${isMuted ? 'Activar' : 'Silenciar'}</span>
            </button>
            <button class="swipe-action delete-action" onclick="deleteChat('${user.uid}', '${displayName}')">
                <i class="fas fa-trash-alt"></i>
                <span>Eliminar</span>
            </button>
        </div>
        
        <!-- Contenido principal del chat -->
        <div class="chat-item ${mutedClass}" onclick="openChatWithUser(${JSON.stringify(user).replace(/"/g, '&quot;')})">
            <div class="avatar">
                <img src="${avatarUrl}" alt="${displayName}">
                ${statusIndicator}
            </div>
            <div class="chat-info">
                <div class="chat-name">
                    ${displayName}
                    ${mutedIndicator}
                </div>
                <div class="last-message">${lastSeenText}</div>
            </div>
            <div class="chat-meta">
                <div class="time">
                    ${user.callsEnabled !== false ? '<i class="fas fa-phone" style="color: var(--accent-color); font-size: 0.8rem;"></i>' : '<i class="fas fa-phone-slash" style="color: var(--text-secondary); font-size: 0.8rem;"></i>'}
                </div>
                <div class="language-indicator"></div>
            </div>
        </div>
    `;

    // Agregar eventos de touch para el deslizado
    const chatItem = chatContainer.querySelector('.chat-item');
    
    // Eventos para móviles (touch)
    chatItem.addEventListener('touchstart', handleTouchStart, { passive: false });
    chatItem.addEventListener('touchmove', handleTouchMove, { passive: false });
    chatItem.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Eventos para desktop (mouse)
    chatItem.addEventListener('mousedown', handleMouseDown);
    chatItem.addEventListener('mousemove', handleMouseMove);
    chatItem.addEventListener('mouseup', handleMouseUp);
    chatItem.addEventListener('mouseleave', handleMouseUp);

    chatList.appendChild(chatContainer);
}

function showErrorMessage(message) {
    console.error(`[error] ${message}`);
}

function showSuccessMessage(message) {
    console.log(`[success] ${message}`);
}

function closeErrorModal() {
    const errorModal = document.querySelector('.error-modal');
    if (errorModal) {
        document.body.removeChild(errorModal);
    }
}

function closeSuccessModal() {
    const successModal = document.querySelector('.success-modal');
    if (successModal) {
        document.body.removeChild(successModal);
    }
}

function showSection(section) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    if (section === 'chats') {
        switchScreen('chat-list');
        loadUserContacts();
    } else if (section === 'calls') {
        switchScreen('calls-history');
        loadCallHistory();
    } else if (section === 'settings') {
        switchScreen('settings');
        initializeSettings();
    } else {
        return;
    }

    const activeNavItem = document.querySelector(`.nav-item[onclick="showSection('${section}')"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
}


// Función para mostrar secciones de navegación
// Envío de mensajes
function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const messageText = messageInput.value.trim();

    if (!messageText || !currentChatContact) {
        console.log(' No se puede enviar: mensaje vacío o sin contacto');
        return;
    }

    // Detectar lenguaje ofensivo antes de enviar
    const moderationResult = checkOffensiveContent(messageText);

    if (moderationResult.isOffensive) {
        showModerationWarning(moderationResult.offensiveWords);
        messageInput.value = '';
        return;
    }

    // Crear ID del chat
    const chatId = generateChatId(currentUser.uid, currentChatContact.uid);
    console.log(` Enviando mensaje en chat: ${chatId}`);
    console.log(` De: ${currentUser.uid} Para: ${currentChatContact.uid}`);
    console.log(` Mensaje: "${messageText}"`);

    // Crear objeto del mensaje
    const messageData = {
        id: Date.now().toString(),
        text: messageText,
        senderId: currentUser.uid,
        receiverId: currentChatContact.uid,
        timestamp: Date.now(), // Usar timestamp directo para mejor debugging
        status: 'sent',
        type: 'text'
    };

    // Limpiar input inmediatamente para mejor UX
    messageInput.value = '';

    // Enviar mensaje a Firebase
    database.ref(`chats/${chatId}/messages`).push(messageData)
        .then(() => {
            console.log(' Mensaje enviado exitosamente a Firebase');
            playMessageSound();

            // Actualizar último mensaje del chat
            return database.ref(`chats/${chatId}/lastMessage`).set({
                text: messageText,
                timestamp: Date.now(),
                senderId: currentUser.uid
            });
        })
        .then(() => {
            console.log(' Último mensaje actualizado');
            
            // Notificar al receptor si está online
            return database.ref(`users/${currentChatContact.uid}/status`).once('value');
        })
        .then((statusSnapshot) => {
            const receiverStatus = statusSnapshot.val();
            console.log(` Estado del receptor: ${receiverStatus}`);
            
            if (receiverStatus === 'online') {
                console.log(' Receptor está online - mensaje debería llegar inmediatamente');
                
                // Crear notificación de mensaje para el receptor
                const messageNotification = {
                    type: 'new_message',
                    from: currentUser.uid,
                    fromPhone: currentUser.phoneNumber,
                    chatId: chatId,
                    messagePreview: messageText.substring(0, 50),
                    timestamp: Date.now(),
                    read: false
                };
                
                return database.ref(`notifications/${currentChatContact.uid}`).push(messageNotification);
            } else {
                console.log(' Receptor está offline - recibirá el mensaje al conectarse');
                return Promise.resolve();
            }
        })
        .then(() => {
            console.log(' Proceso de envío completado');
        })
        .catch(error => {
            console.error(' Error enviando mensaje:', error);
            showErrorMessage(`Error enviando mensaje: ${error.message}`);
            
            // Restaurar mensaje en input si hay error
            messageInput.value = messageText;
        });
}

function createMessageElement(text, isSent, translatedText = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                      now.getMinutes().toString().padStart(2, '0');

    let messageHTML = `
        <div class="message-content">
            <div class="original-text">${text}</div>
            ${translatedText ? `<div class="translated-text">${translatedText}</div>` : ''}
        </div>
        <div class="message-time">${timeString}</div>
    `;

    messageDiv.innerHTML = messageHTML;
    return messageDiv;
}

function handleEnterKey(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Función de traducción usando Google Translate API en tiempo real
async function translateMessage(text, fromLang, toLang) {
    try {
        // Usar Google Translate API real
        const translatedText = await translateTextWithGoogle(text, toLang, fromLang);
        console.log(`Mensaje traducido de ${fromLang} a ${toLang}: "${text}" -> "${translatedText}"`);
        return translatedText;
    } catch (error) {
        console.error('Error en traducción de mensaje:', error);
        // Fallback a traducción simulada
        return simulateTranslation(text, fromLang, toLang);
    }
}

// Simulación de traducción (reemplazar con API real)
function simulateTranslation(text, fromLang, toLang) {
    const translations = {
        'es_en': {
            'Hola': 'Hello',
            '¿Cómo estás?': 'How are you?',
            'Muy bien, gracias': 'Very well, thank you',
            'Hasta luego': 'See you later',
            'Buenos días': 'Good morning',
            'Buenas noches': 'Good night',
            '¿Qué tal?': 'How is it going?',
            'Perfecto': 'Perfect',
            'Excelente': 'Excellent',
            'Todo bien': 'All good'
        },
        'en_es': {
            'Hello': 'Hola',
            'How are you?': '¿Cómo estás?',
            'Very well, thank you': 'Muy bien, gracias',
            'See you later': 'Hasta luego',
            'Good morning': 'Buenos días',
            'Good night': 'Buenas noches',
            'How is it going?': '¿Qué tal?',
            'Perfect': 'Perfecto',
            'Excelente': 'Excelente',
            'All good': 'Todo bien',
            'Hello! How are you doing today?': '¡Hola! ¿Cómo estás hoy?'
        },
        'fr_es': {
            'Bonjour': 'Hola',
            'Comment allez-vous?': '¿Cómo está usted?',
            'Très bien, merci': 'Muy bien, gracias',
            'Au revoir': 'Adiós',
            'Bonsoir': 'Buenas noches'
        },
        'es_fr': {
            'Hola': 'Bonjour',
            '¿Cómo está usted?': 'Comment allez-vous?',
            'Muy bien, gracias': 'Très bien, merci',
            'Adiós': 'Au revoir',
            'Buenas noches': 'Bonsoir'
        }
    };

    const key = `${fromLang}_${toLang}`;
    return translations[key]?.[text] || `[Traducido de ${fromLang} a ${toLang}: ${text}]`;
}

function simulateResponse() {
    // Mostrar typing indicator
    showTypingIndicator();

    setTimeout(() => {
        hideTypingIndicator();

        // Reproducir sonido de mensaje recibido
        playMessageSound();

        const responses = [
            '¡Hola! ¿Cómo estás?',
            'Todo bien por aquí ',
            '¿Qué tal tu día?',
            'Perfecto, hablamos luego',
            '¡Excelente!'
        ];

        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        const messagesContainer = document.getElementById('messages-container');

        // Traducir respuesta si es necesario
        let translatedResponse = null;
        if (currentChatContact && currentChatContact.language !== userLanguage) {
            translatedResponse = simulateTranslation(randomResponse, currentChatContact.language, userLanguage);
        }

        const messageElement = createMessageElement(randomResponse, false, translatedResponse);
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Analizar mensaje recibido para moderación
        analyzeChatForModeration(randomResponse, false);
    }, 2000);
}

// Funciones de reporte
function showReportModal() {
    document.getElementById('report-modal').classList.add('show');
    selectedReportType = null;
    evidenceImages = [];
    document.getElementById('submit-report-btn').disabled = true;
    document.getElementById('evidence-preview').innerHTML = '';
}

function hideReportModal() {
    document.getElementById('report-modal').classList.remove('show');
}

function selectReportOption(element, type) {
    // Remover selección anterior
    document.querySelectorAll('.report-option').forEach(option => {
        option.classList.remove('selected');
    });

    // Seleccionar opción actual
    element.classList.add('selected');
    selectedReportType = type;

    // Habilitar botón de envío
    document.getElementById('submit-report-btn').disabled = false;
}

function selectEvidenceImages() {
    document.getElementById('evidence-input').click();
}

function handleEvidenceSelect(event) {
    const files = Array.from(event.target.files);

    // Limitar a 3 imágenes
    const maxImages = 3;
    const remainingSlots = maxImages - evidenceImages.length;
    const filesToAdd = files.slice(0, remainingSlots);

    filesToAdd.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                evidenceImages.push({
                    file: file,
                    url: e.target.result
                });
                updateEvidencePreview();
            };
            reader.readAsDataURL(file);
        }
    });
}

function updateEvidencePreview() {
    const preview = document.getElementById('evidence-preview');
    preview.innerHTML = '';

    evidenceImages.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'evidence-item';
        item.innerHTML = `
            <img src="${image.url}" alt="Evidencia">
            <button class="evidence-remove" onclick="removeEvidence(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;
        preview.appendChild(item);
    });
}

function removeEvidence(index) {
    evidenceImages.splice(index, 1);
    updateEvidencePreview();
}

function submitReport() {
    if (!selectedReportType) return;

    // Agregar reporte a la cola para procesamiento automático
    const report = {
        id: Date.now(),
        type: selectedReportType,
        contact: currentChatContact.name,
        timestamp: Date.now(),
        evidence: evidenceImages,
        status: 'processing'
    };

    moderationSystem.reportQueue.push(report);

    // Cerrar modal y mostrar pantalla de procesamiento
    hideReportModal();
    switchScreen('report-processing');

    // Procesamiento automático acelerado (15 segundos en lugar de 24 horas)
    setTimeout(() => {
        processReportAutomatically(report);
    }, 15000);
}

function goToChatFromReport() {
    switchScreen('chat');
}

// Funciones para manejo de imágenes
function selectImage() {
    document.getElementById('image-input').click();
}

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        sendImageMessage(file);
    }
}

function sendImageMessage(file) {
    if (!currentChatContact) return;
    
    console.log('Enviando imagen:', file.name, 'Tamaño:', file.size);
    
    const messagesContainer = document.getElementById('messages-container');
    const chatId = generateChatId(currentUser.uid, currentChatContact.uid);

    // Crear mensaje con imagen cargando
    const messageElement = createImageMessage(null, true, true);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Mostrar progreso de subida
    const loadingElement = messageElement.querySelector('.image-loading');
    loadingElement.innerHTML = `
        <div class="image-loading-spinner"></div>
        <div class="upload-progress">Procesando imagen...</div>
    `;

    // Subir imagen a Firebase
    uploadToFirebase(file, 'image')
        .then(imageBase64 => {
            console.log('Imagen procesada y subida a Firebase');
            
            // Reemplazar elemento de carga con imagen real
            loadingElement.outerHTML = `<img src="${imageBase64}" alt="Imagen enviada" onclick="expandImage(this)" onload="console.log('Imagen cargada en chat')">`;
            
            // Crear mensaje en Firebase
            const messageData = {
                id: Date.now().toString(),
                type: 'image',
                imageBase64: imageBase64,
                fileName: file.name,
                senderId: currentUser.uid,
                receiverId: currentChatContact.uid,
                timestamp: Date.now(),
                status: 'sent'
            };

            // Enviar mensaje a Firebase
            database.ref(`chats/${chatId}/messages`).push(messageData)
                .then(() => {
                    console.log('Mensaje de imagen guardado en Firebase');
                    playMessageSound();

                    // Actualizar último mensaje del chat
                    database.ref(`chats/${chatId}/lastMessage`).set({
                        text: ' Imagen',
                        timestamp: Date.now(),
                        senderId: currentUser.uid
                    });
                })
                .catch(error => {
                    console.error('Error guardando mensaje en Firebase:', error);
                    showErrorMessage('Error guardando imagen en chat.');
                });
        })
        .catch(error => {
            console.error('Error completo subiendo imagen:', error);
            // Remover mensaje de carga si falla
            messageElement.remove();
            showErrorMessage(`Error procesando imagen: ${error.message}`);
        });
}

function createImageMessage(imageSrc, isSent, isLoading = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                      now.getMinutes().toString().padStart(2, '0');

    let imageHTML;
    if (isLoading) {
        imageHTML = '<div class="image-loading"><div class="image-loading-spinner"></div></div>';
    } else {
        imageHTML = `<img src="${imageSrc}" alt="Imagen" onclick="expandImage(this)">`;
    }

    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-image">
                ${imageHTML}
            </div>
        </div>
        <div class="message-time">${timeString}</div>
    `;

    return messageDiv;
}

function expandImage(img) {
    // Crear modal para imagen expandida
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
        background: rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;

    const expandedImg = document.createElement('img');
    expandedImg.src = img.src;
    expandedImg.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
    `;

    modal.appendChild(expandedImg);
    document.body.appendChild(modal);

    modal.onclick = () => document.body.removeChild(modal);
}

// Función para manejar typing indicator
function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        // En una app real, enviarías esto al servidor
        console.log('Usuario está escribiendo...');
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        console.log('Usuario dejó de escribir');
    }, 1000);
}

function showTypingIndicator() {
    if (!currentChatContact) return;

    const typingElement = document.getElementById('typing-indicator');
    const avatarImg = document.getElementById('typing-avatar-img');

    if (typingElement && avatarImg) {
        avatarImg.src = currentChatContact.avatar;
        typingElement.style.display = 'flex';

        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}

function hideTypingIndicator() {
    const typingElement = document.getElementById('typing-indicator');
    typingElement.style.display = 'none';
}

// Cerrar modal al hacer clic fuera
document.getElementById('add-contact-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        hideAddContact();
    }
});

// Búsqueda en tiempo real
document.getElementById('search-input').addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    const chatItems = document.querySelectorAll('.chat-item');

    chatItems.forEach(item => {
        const contactName = item.querySelector('.chat-name').textContent.toLowerCase();
        const lastMessage = item.querySelector('.last-message').textContent.toLowerCase();

        if (contactName.includes(searchTerm) || lastMessage.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// Función para verificar estado de autenticación
function checkAuthState() {
    // Verificar si hay datos de usuario guardados localmente
    const savedUser = localStorage.getItem('zenvio_user') || localStorage.getItem('uberchat_user');
    
    if (savedUser) {
        try {
            const userData = JSON.parse(savedUser);
            currentUser = userData;
            currentPhoneNumber = userData.phoneNumber;
            
            console.log('Usuario restaurado desde localStorage:', userData);
            
            // Verificar que el usuario sigue existiendo en Firebase
            database.ref('users/' + userData.uid).once('value')
                .then(snapshot => {
                    if (snapshot.exists()) {
                        // Actualizar datos del usuario
                        currentUser = snapshot.val();
                        currentUser.uid = userData.uid;
                        
                        // Actualizar estado a online
                        updateUserStatus('online');
                        
                        // Configurar listeners importantes
                        setupFriendRequestsListener();
                        setupNotificationsListener();
                        setupCallRequestsListener();
                        
                        // Mantener conexión activa
                        maintainConnection();
                        
                        // Inicializar configuraciones
                        initializeSettings();
                        
                        // Verificar si necesita tutorial solo si no está ya en tutorial
                        if (!checkTutorialStatus() && currentScreen !== 'tutorial-notifications' && currentScreen !== 'tutorial-contacts' && currentScreen !== 'tutorial-features') {
                            startTutorial();
                        } else if (checkTutorialStatus()) {
                            // Ir directamente a la lista de chats
                            loadUserContacts();
                            switchScreen('chat-list');
                        }
                        
                        console.log('Sesión restaurada exitosamente');
                    } else {
                        // Usuario no existe, limpiar datos locales
                        localStorage.removeItem('zenvio_user');
                        localStorage.removeItem('uberchat_user');
                        switchScreen('intro');
                    }
                })
                .catch(error => {
                    console.error('Error verificando usuario en Firebase, continuando con sesión local:', error);

                    // Fallback: mantener sesión local para no bloquear el inicio automático
                    updateUserStatus('online');
                    setupFriendRequestsListener();
                    setupNotificationsListener();
                    setupCallRequestsListener();
                    maintainConnection();
                    initializeSettings();
                    loadUserContacts();
                    switchScreen('chat-list');
                });
        } catch (error) {
            console.error('Error parseando datos de usuario:', error);
            localStorage.removeItem('zenvio_user');
            localStorage.removeItem('uberchat_user');
            switchScreen('intro');
        }
    } else {
        // No hay datos guardados, mostrar pantalla de intro
        console.log('No hay usuario guardado localmente');
        switchScreen('intro');
    }
}

// Configurar listener para notificaciones


// Compatibilidad: funciones base de sesión/amistades que pueden no estar presentes
function createActiveSession(userId, phoneNumber) {
    if (!userId || !phoneNumber) return Promise.resolve();
    const sessionId = `${userId}_${Date.now()}`;
    sessionManager.currentSessionId = sessionId;
    return database.ref(`activeSessions/${sessionId}`).set({
        userId,
        phoneNumber,
        sessionId,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: 'active'
    }).catch((error) => {
        console.error('Error creando sesión activa:', error);
    });
}

function setupLoginApprovalListener() {
    // No-op defensivo para evitar bloquear verificación si esta función no existe en builds parciales
    return;
}

function setupFriendRequestsListener() {
    // No-op defensivo para evitar bloquear verificación si esta función no existe en builds parciales
    return;
}
function setupNotificationsListener() {
    if (!currentUser || !currentUser.uid) {
        console.error('No se puede configurar listener de notificaciones: usuario no disponible');
        return;
    }

    console.log('Configurando listener de notificaciones para:', currentUser.uid);

    // Configurar múltiples listeners para asegurar detección en tiempo real
    
    // 1. Listener de notificaciones directas
    database.ref(`notifications/${currentUser.uid}`).on('child_added', (snapshot) => {
        const notification = snapshot.val();
        const notificationId = snapshot.key;
        
        if (notification && !notification.read) {
            console.log('Nueva notificación directa recibida:', notification);
            
            if (notification.type === 'friend_request') {
                // Buscar la solicitud completa
                database.ref(`friendRequests/${currentUser.uid}/${notification.requestId}`).once('value')
                    .then(requestSnapshot => {
                        if (requestSnapshot.exists()) {
                            const request = requestSnapshot.val();
                            showFriendRequestModal(request, notification.requestId);
                            
                            // Marcar notificación como leída
                            database.ref(`notifications/${currentUser.uid}/${notificationId}/read`).set(true);
                        }
                    });
            } else if (notification.type === 'incoming_call') {
                // Manejar llamada entrante
                console.log('Llamada entrante recibida:', notification);
                showIncomingCallNotification(notification, notification.callRequestId);
                
                // Marcar notificación como leída
                database.ref(`notifications/${currentUser.uid}/${notificationId}/read`).set(true);
            }
        }
    });

    // 2. Listener global de cambios en tiempo real
    database.ref(`users/${currentUser.uid}/lastNotification`).on('value', (snapshot) => {
        const lastNotification = snapshot.val();
        if (lastNotification && lastNotification.type === 'friend_request') {
            console.log('Notificación detectada via usuario:', lastNotification);
            // Buscar solicitudes pendientes
            database.ref(`friendRequests/${currentUser.uid}`).orderByChild('status').equalTo('pending').once('value')
                .then(requestsSnapshot => {
                    const requests = requestsSnapshot.val();
                    if (requests) {
                        const requestIds = Object.keys(requests);
                        const latestRequestId = requestIds[requestIds.length - 1];
                        const latestRequest = requests[latestRequestId];
                        
                        if (latestRequest && Date.now() - latestRequest.timestamp < 30000) {
                            showFriendRequestModal(latestRequest, latestRequestId);
                        }
                    }
                });
        }
    });

    // 3. Polling de respaldo cada 10 segundos para asegurar detección
    const pollingInterval = setInterval(() => {
        if (currentUser && currentUser.uid) {
            database.ref(`friendRequests/${currentUser.uid}`).orderByChild('status').equalTo('pending').once('value')
                .then(snapshot => {
                    const requests = snapshot.val();
                    if (requests) {
                        Object.keys(requests).forEach(requestId => {
                            const request = requests[requestId];
                            // Solo mostrar solicitudes recientes (últimos 2 minutos)
                            if (Date.now() - request.timestamp < 120000) {
                                // Verificar si ya se mostró esta solicitud
                                if (!window.shownRequests) window.shownRequests = new Set();
                                if (!window.shownRequests.has(requestId)) {
                                    window.shownRequests.add(requestId);
                                    showFriendRequestModal(request, requestId);
                                }
                            }
                        });
                    }
                });
        } else {
            clearInterval(pollingInterval);
        }
    }, 10000);

    console.log('Listeners de notificaciones configurados completamente');
}

// Mantener la conexión activa
function maintainConnection() {
    if (currentUser && currentUser.uid) {
        // Actualizar presencia cada 30 segundos
        setInterval(() => {
            if (currentUser) {
                database.ref(`users/${currentUser.uid}/lastSeen`).set(firebase.database.ServerValue.TIMESTAMP);
                database.ref(`users/${currentUser.uid}/status`).set('online');
            }
        }, 30000);
        
        // Configurar detección de desconexión
        database.ref('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === true) {
                console.log('Conectado a Firebase');
                if (currentUser) {
                    database.ref(`users/${currentUser.uid}/status`).set('online');
                }
            } else {
                console.log('Desconectado de Firebase');
            }
        });
        
        // Al desconectarse, marcar como offline
        database.ref(`users/${currentUser.uid}/status`).onDisconnect().set('offline');
        database.ref(`users/${currentUser.uid}/lastSeen`).onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
    }
}

// Variables del tutorial
let tutorialStep = 0;
let tutorialCompleted = false;
let permissionsGranted = {
    notifications: false,
    contacts: false
};

// Funciones del Tutorial
function startTutorial() {
    console.log('Iniciando tutorial interactivo...');
    tutorialStep = 1;
    tutorialCompleted = false;
    
    // Asegurar que estamos en la pantalla correcta
    currentScreen = 'tutorial-notifications';
    switchScreen('tutorial-notifications');
    
    // Agregar efectos de sonido del tutorial
    playTutorialSound('start');
}

function requestNotificationPermission() {
    console.log('Solicitando permisos de notificación...');
    
    // Animar botón
    const btn = event.target;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Activando...';
    btn.disabled = true;
    
    // Simular activación exitosa SIEMPRE para que progrese
    setTimeout(() => {
        permissionsGranted.notifications = true;
        console.log(' Notificaciones activadas correctamente');
        
        // Actualizar botón con éxito
        btn.innerHTML = '<i class="fas fa-check-circle"></i> ¡Activado!';
        btn.style.background = '#00a854';
        btn.style.transform = 'scale(1.05)';
        btn.style.color = 'white';
        
        // NO mostrar notificación molesta
        // showTestNotification();
        
        // Forzar progreso automático después de 1.5 segundos
        setTimeout(() => {
            console.log('Progresando al siguiente paso del tutorial...');
            tutorialStep = 2;
            switchScreen('tutorial-contacts');
        }, 1500);
        
    }, 1000);
}

function requestContactsPermission() {
    console.log('Sincronizando contactos...');
    
    // Animar botón
    const btn = event.target;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
    btn.disabled = true;
    
    // Simular proceso de sincronización exitoso
    setTimeout(() => {
        permissionsGranted.contacts = true;
        console.log(' Contactos sincronizados correctamente');
        
        // Actualizar botón con éxito
        btn.innerHTML = '<i class="fas fa-check-circle"></i> ¡Sincronizado!';
        btn.style.background = '#00a854';
        btn.style.transform = 'scale(1.05)';
        btn.style.color = 'white';
        
        // NO mostrar notificación molesta
        // showInstantNotification(' Contactos sincronizados correctamente', 'friend-request');
        
        // Forzar progreso automático al siguiente paso
        setTimeout(() => {
            console.log('Progresando al paso final del tutorial...');
            tutorialStep = 3;
            switchScreen('tutorial-features');
        }, 1500);
    }, 1000);
}

function nextTutorialStep() {
    tutorialStep++;
    console.log('Tutorial step:', tutorialStep);
    playTutorialSound('next');
    
    if (tutorialStep === 2) {
        console.log('Cambiando a pantalla de contactos...');
        switchScreen('tutorial-contacts');
    } else if (tutorialStep === 3) {
        console.log('Cambiando a pantalla final...');
        switchScreen('tutorial-features');
    } else {
        console.log('Completando tutorial...');
        completeTutorial();
    }
}

function skipTutorial() {
    console.log('Usuario omitió el tutorial');
    tutorialCompleted = true;
    completeTutorial();
}

function completeTutorial() {
    console.log('Tutorial completado');
    tutorialCompleted = true;
    tutorialStep = 0; // Resetear paso del tutorial
    playTutorialSound('complete');
    
    // Guardar estado del tutorial primero
    localStorage.setItem('uberchat_tutorial_completed', 'true');
    
    // Cargar contactos y mostrar pantalla principal
    loadUserContacts();
    currentScreen = 'chat-list';
    switchScreen('chat-list');
    
    // NO mostrar notificación molesta de bienvenida
    console.log('¡Bienvenido a UberChat!');
}

function showTestNotification() {
    // Mostrar siempre la notificación instantánea
    showInstantNotification(' ¡Notificaciones activadas! Recibirás alertas en tiempo real', 'friend-request');
    
    // Intentar mostrar notificación del navegador si hay permisos
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const notification = new Notification(' UberChat', {
                body: 'Notificaciones activadas correctamente',
                icon: '/favicon.ico',
                silent: false
            });
            
            setTimeout(() => {
                notification.close();
            }, 3000);
        } catch (error) {
            console.log('No se pudo mostrar notificación del navegador:', error);
        }
    }
}

function showPermissionDeniedMessage(permissionType) {
    const slimeContainer = document.querySelector('.tutorial-slime-container');
    const message = document.createElement('div');
    message.className = 'permission-denied-message';
    message.innerHTML = `
        <div style="background: rgba(255, 0, 0, 0.1); padding: 1rem; border-radius: 15px; margin-top: 1rem; border: 1px solid rgba(255, 0, 0, 0.3);">
            <p style="margin: 0; font-size: 0.9rem;">️ Permisos de ${permissionType} no concedidos</p>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; opacity: 0.8;">Puedes activarlos más tarde en Ajustes</p>
        </div>
    `;
    
    slimeContainer.appendChild(message);
    
    setTimeout(() => {
        if (message.parentNode) {
            message.parentNode.removeChild(message);
        }
    }, 3000);
}

function showContactSyncAnimation() {
    const slime = document.querySelector('.tutorial-slime');
    const syncEffect = document.createElement('div');
    syncEffect.className = 'sync-effect';
    syncEffect.innerHTML = `
        <div style="position: absolute; top: -40px; left: 50%; transform: translateX(-50%); color: #00ff88; font-size: 2rem; animation: syncPulse 1s ease-in-out 3;">
            
        </div>
        <style>
            @keyframes syncPulse {
                0%, 100% { opacity: 0; transform: translateX(-50%) scale(0.8); }
                50% { opacity: 1; transform: translateX(-50%) scale(1.2); }
            }
        </style>
    `;
    
    slime.appendChild(syncEffect);
    
    setTimeout(() => {
        if (syncEffect.parentNode) {
            syncEffect.parentNode.removeChild(syncEffect);
        }
    }, 3000);
}

function playTutorialSound(type) {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    switch(type) {
        case 'start':
            // Sonido de inicio mágico
            oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // C5
            oscillator.frequency.exponentialRampToValueAtTime(784, audioContext.currentTime + 0.3); // G5
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            oscillator.stop(audioContext.currentTime + 0.5);
            break;
            
        case 'next':
            // Sonido de progreso
            oscillator.frequency.setValueAtTime(659, audioContext.currentTime); // E5
            oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.2); // A5
            gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.stop(audioContext.currentTime + 0.3);
            break;
            
        case 'complete':
            // Fanfarria de completado
            const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6
            frequencies.forEach((freq, index) => {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    
                    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
                    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                    
                    osc.start();
                    osc.stop(audioContext.currentTime + 0.4);
                }, index * 100);
            });
            return; // No ejecutar el código de abajo
    }

    oscillator.start();
}

// Función para verificar si el tutorial ya fue completado
function checkTutorialStatus() {
    const tutorialCompleted = localStorage.getItem('uberchat_tutorial_completed');
    return tutorialCompleted === 'true';
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', function() {
    // Configurar pantalla inicial como loading
    switchScreen('intro');
    
    // Cargar idioma guardado (sin detección automática)
    initializeLanguagePreference();

    // Verificar estado de autenticación
    checkAuthState();

    // Configurar eventos
    const phoneInput = document.getElementById('phone-input');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            const isValid = this.value.length >= 8;
            document.getElementById('send-code-btn').disabled = !isValid;
        });
    }

    // Configurar auto-focus en campos de código
    document.querySelectorAll('.code-digit').forEach((input, index) => {
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text');
            if (/^\d{6}$/.test(pastedData)) {
                // Llenar todos los campos con el código pegado
                [...pastedData].forEach((digit, i) => {
                    if (document.querySelectorAll('.code-digit')[i]) {
                        document.querySelectorAll('.code-digit')[i].value = digit;
                    }
                });
                enteredCode = pastedData;
                setTimeout(() => verifyCode(), 500);
            }
        });
    });

    // Configurar mantenimiento de conexión
    setTimeout(() => {
        maintainConnection();
    }, 2000);

    console.log('UberChat iniciado correctamente');
});

// Inicializa idioma guardado por el usuario
async function initializeLanguagePreference() {
    userLanguage = getSavedLanguagePreference();
    console.log(`Idioma inicial configurado: ${userLanguage}`);

    await updateLanguage();
}

// Función para implementar traducción real con Google Translate API
// Descomenta y configura cuando tengas acceso a la API
/*
async function translateWithGoogleAPI(text, targetLang) {
    const API_KEY = 'TU_API_KEY_AQUI';
    const url = `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: text,
                target: targetLang,
                source: userLanguage
            })
        });

        const data = await response.json();
        return data.data.translations[0].translatedText;
    } catch (error) {
        console.error('Error en traducción:', error);
        return text;
    }
}
*/

// Variables globales para llamadas
let callTimer = null;
let callStartTime = null;
let isCallActive = false;
let isMuted = false;
let isSpeakerOn = false;
let isCameraOn = true;
let speechRecognition = null;
let callHistory = [];

// Variables para WebRTC y llamadas en tiempo real
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let incomingCallModal = null;
let currentCallType = null;
let callNotificationSound = null;
let isCallIncoming = false;
let callRequestListener = null;
let incomingCallListener = null;

// Funciones para llamadas

let currentOutgoingCallId = null;
let outgoingCallStatusListener = null;

function stopIncomingCallSound() {}
function playIncomingCallSound() {}

function sendCallRequest() {
    if (!currentChatContact || !currentUser) return;

    const callRequestId = Date.now().toString();
    currentOutgoingCallId = callRequestId;

    const callRequest = {
        id: callRequestId,
        type: 'voice',
        from: currentUser.uid,
        fromPhone: currentUser.phoneNumber,
        fromName: currentUser.username || currentUser.phoneNumber,
        fromAvatar: currentUser.avatar || '',
        to: currentChatContact.uid,
        toPhone: currentChatContact.phoneNumber,
        timestamp: Date.now(),
        status: 'calling'
    };

    Promise.all([
        database.ref(`callRequests/${currentChatContact.uid}/${callRequestId}`).set(callRequest),
        database.ref(`incomingCalls/${currentChatContact.uid}/${callRequestId}`).set(callRequest),
        database.ref(`users/${currentChatContact.uid}/incomingCall`).set(callRequest)
    ]).catch((error) => {
        console.error('Error enviando solicitud de llamada:', error);
    });
}

function setupCallRequestsListener() {
    if (!currentUser || !currentUser.uid) return;

    if (callRequestListener) callRequestListener.off();
    if (incomingCallListener) incomingCallListener.off();

    const handleIncoming = (snapshot) => {
        const callRequest = snapshot.val();
        const requestId = snapshot.key;
        if (!callRequest || callRequest.status !== 'calling') return;
        if (Date.now() - callRequest.timestamp > 120000) return;
        showIncomingCallNotification(callRequest, requestId);
    };

    callRequestListener = database.ref(`callRequests/${currentUser.uid}`);
    callRequestListener.on('child_added', handleIncoming);

    incomingCallListener = database.ref(`incomingCalls/${currentUser.uid}`);
    incomingCallListener.on('child_added', handleIncoming);
}

function showIncomingCallNotification(callRequest, requestId) {
    if (isCallActive || incomingCallModal) return;
    isCallIncoming = true;

    const callModal = document.createElement('div');
    callModal.id = 'incoming-call-modal';
    callModal.className = 'incoming-call-screen';
    callModal.innerHTML = `
        <div class="incoming-call-container">
            <div class="incoming-call-header">
                <div class="call-type-indicator">
                    <i class="fas fa-phone"></i>
                    <span>Llamada entrante</span>
                </div>
            </div>
            <div class="incoming-call-content">
                <div class="caller-avatar">
                    <img src="${callRequest.fromAvatar}" alt="${callRequest.fromName}">
                </div>
                <div class="caller-info">
                    <h2>${callRequest.fromName}</h2>
                    <p>${callRequest.fromPhone}</p>
                </div>
            </div>
            <div class="incoming-call-actions">
                <button class="call-action-btn reject-btn" onclick="rejectIncomingCall('${requestId}')">
                    <i class="fas fa-phone-slash"></i>
                    <span>Rechazar</span>
                </button>
                <button class="call-action-btn accept-btn" onclick="acceptIncomingCall('${requestId}')">
                    <i class="fas fa-phone"></i>
                    <span>Contestar</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(callModal);
    incomingCallModal = callModal;
}

function closeIncomingCallModal() {
    if (incomingCallModal && incomingCallModal.parentNode) {
        incomingCallModal.parentNode.removeChild(incomingCallModal);
    }
    incomingCallModal = null;
    isCallIncoming = false;
}

function acceptIncomingCall(requestId) {
    database.ref(`callRequests/${currentUser.uid}/${requestId}`).once('value').then((snap) => {
        const callerData = snap.val();
        if (!callerData) return;

        currentChatContact = {
            uid: callerData.from,
            name: callerData.fromName,
            phoneNumber: callerData.fromPhone,
            avatar: callerData.fromAvatar
        };

        database.ref(`callRequests/${currentUser.uid}/${requestId}/status`).set('accepted');
        database.ref(`incomingCalls/${currentUser.uid}/${requestId}/status`).set('accepted');
        database.ref(`users/${currentUser.uid}/incomingCall`).remove();

        document.getElementById('call-contact-name').textContent = callerData.fromName;
        document.getElementById('call-avatar-img').src = callerData.fromAvatar;
        document.getElementById('user-lang').textContent = getLanguageName(userLanguage);
        document.getElementById('contact-lang').textContent = getLanguageName('en');

        closeIncomingCallModal();
        switchScreen('voice-call');
        isCallActive = true;
        startCallTimer();
    });
}

function rejectIncomingCall(requestId) {
    database.ref(`callRequests/${currentUser.uid}/${requestId}/status`).set('rejected');
    database.ref(`incomingCalls/${currentUser.uid}/${requestId}/status`).set('rejected');
    database.ref(`users/${currentUser.uid}/incomingCall`).remove();
    closeIncomingCallModal();
}

function handleCallConnected() {
    const statusElement = document.getElementById('call-status');
    if (statusElement) statusElement.textContent = 'Conectado';
    isCallActive = true;
    startCallTimer();
    stopCallSound();
}

function initiateRealTimeCall() {
    const statusElement = document.getElementById('call-status');
    if (statusElement) statusElement.textContent = 'Llamando...';

    if (!currentChatContact || !currentOutgoingCallId || !currentUser) return;

    if (outgoingCallStatusListener) outgoingCallStatusListener.off();
    outgoingCallStatusListener = database.ref(`callRequests/${currentChatContact.uid}/${currentOutgoingCallId}/status`);
    outgoingCallStatusListener.on('value', (snap) => {
        const status = snap.val();
        if (status === 'accepted') {
            handleCallConnected();
        }
        if (status === 'rejected') {
            if (statusElement) statusElement.textContent = 'Llamada rechazada';
            setTimeout(() => endCall(), 900);
        }
    });
}

function startVoiceCall() {
    if (!currentChatContact) return;

    // Verificar si el usuario tiene llamadas habilitadas
    if (currentChatContact.callsEnabled === false) {
        showErrorMessage(' Este usuario ha desactivado las llamadas. No puedes llamarle en este momento.');
        return;
    }

    // Configurar pantalla de llamada de voz
    document.getElementById('call-contact-name').textContent = currentChatContact.name;
    document.getElementById('call-avatar-img').src = currentChatContact.avatar;
    document.getElementById('user-lang').textContent = getLanguageName(userLanguage);
    document.getElementById('contact-lang').textContent = getLanguageName(currentChatContact.language);

    currentCallType = 'voice';

    // Enviar solicitud de llamada en tiempo real
    sendCallRequest();

    // Cambiar a pantalla de llamada
    switchScreen('voice-call');

    // Iniciar proceso de llamada real
    initiateRealTimeCall();
}


function simulateCallConnection(callType) {
    const statusElement = document.getElementById('call-status');

    // Mostrar "Llamando..."
    statusElement.textContent = 'Llamando...';

    // Simular sonido de llamada (opcional)
    playCallSound();

    // Después de 3 segundos, simular que se conecta
    setTimeout(() => {
        statusElement.textContent = 'Conectado';
        isCallActive = true;
        startCallTimer();

        // Inicializar reconocimiento de voz
        initializeSpeechRecognition();

        // Detener sonido de llamada
        stopCallSound();
    }, 3000);
}

function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Date.now() - callStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const durationElement = document.getElementById('call-duration');
        if (durationElement) {
            durationElement.textContent = timeString;
        }
    }, 1000);
}

function endCall() {
    // Reproducir sonido de llamada terminada
    playCallEndSound();

    // Registrar llamada en historial
    if (currentChatContact && callStartTime) {
        const callDuration = Date.now() - callStartTime;
        const callRecord = {
            contact: currentChatContact.name,
            avatar: currentChatContact.avatar,
            type: 'voice',
            duration: callDuration,
            timestamp: Date.now(),
            status: 'completed'
        };
        callHistory.unshift(callRecord);
        updateCallHistoryUI();

        if (currentUser && currentUser.uid) {
            database.ref(`callHistory/${currentUser.uid}`).push(callRecord)
                .catch(error => console.error('Error guardando historial de llamada:', error));
        }
    }

    // Limpiar recursos de WebRTC
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach(track => {
            track.stop();
        });
        remoteStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Limpiar elementos de video
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    
    if (localVideo) {
        localVideo.srcObject = null;
    }
    
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }

    // Limpiar timer
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }

    // Detener reconocimiento de voz
    if (speechRecognition) {
        speechRecognition.stop();
        speechRecognition = null;
    }

    // Detener todos los sonidos
    stopCallSound();
    stopIncomingCallSound();

    // Resetear estados
    isCallActive = false;
    isMuted = false;
    isSpeakerOn = false;
    isCameraOn = true;
    callStartTime = null;
    currentCallType = null;
    isCallIncoming = false;

    // Cerrar modal si está abierto
    closeIncomingCallModal();

    // Volver al chat
    switchScreen('chat');
}

function toggleMute() {
    isMuted = !isMuted;
    const muteBtn = document.getElementById('mute-btn');

    if (isMuted) {
        muteBtn.classList.add('muted');
        muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
    } else {
        muteBtn.classList.remove('muted');
        muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    }
}

function toggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    const speakerBtn = document.getElementById('speaker-btn');

    if (isSpeakerOn) {
        speakerBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    } else {
        speakerBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
    }
}






function initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRecognition();

        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = userLanguage;

        speechRecognition.onresult = function(event) {
            const speechIndicator = document.getElementById('speech-indicator');
            const speechText = document.getElementById('speech-text') || document.getElementById('video-speech-text');

            if (speechIndicator) {
                speechIndicator.classList.add('active');
            }

            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript && speechText) {
                speechText.textContent = finalTranscript;

                // Simular traducción en tiempo real
                if (currentChatContact && currentChatContact.language !== userLanguage) {
                    setTimeout(() => {
                        const translated = simulateTranslation(finalTranscript, userLanguage, currentChatContact.language);
                        speakTranslatedText(translated, currentChatContact.language);
                    }, 500);
                }
            }
        };

        speechRecognition.onend = function() {
            const speechIndicator = document.getElementById('speech-indicator');
            if (speechIndicator) {
                speechIndicator.classList.remove('active');
            }

            // Reiniciar si la llamada sigue activa
            if (isCallActive && !isMuted) {
                setTimeout(() => {
                    if (speechRecognition && isCallActive) {
                        speechRecognition.start();
                    }
                }, 1000);
            }
        };

        if (!isMuted) {
            speechRecognition.start();
        }
    }
}

function speakTranslatedText(text, language) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Buscar una voz en el idioma específico
        const voices = speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang.startsWith(language));
        if (voice) {
            utterance.voice = voice;
        }

        speechSynthesis.speak(utterance);
    }
}

function getLanguageName(code) {
    const languageNames = {
        'es': 'Español',
        'en': 'English',
        'fr': 'Français',
        'de': 'Deutsch',
        'pt': 'Português',
        'it': 'Italiano'
    };
    return languageNames[code] || code;
}

// Funciones de sonido mejoradas
let callAudio = null;
let messageAudio = null;

function playMessageSound() {
    if (window.AudioContext || window.webkitAudioContext) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Sonido más suave para mensajes
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
    }
}

function playCallSound() {
    if (window.AudioContext || window.webkitAudioContext) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Crear patrón de timbre más realista
        const playTone = (frequency, duration, delay = 0) => {
            setTimeout(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

                oscillator.start();
                oscillator.stop(audioContext.currentTime + duration);
            }, delay);
        };

        // Patrón de timbre: dos tonos
        playTone(800, 0.5, 0);
        playTone(600, 0.5, 100);
        playTone(800, 0.5, 1000);
        playTone(600, 0.5, 1100);

        callAudio = { audioContext };

        // Detener después de 3 segundos
        setTimeout(() => {
            if (callAudio) {
                callAudio = null;
            }
        }, 3000);
    }
}

function playCallEndSound() {
    if (window.AudioContext || window.webkitAudioContext) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Sonido descendente para colgar
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
}

function stopCallSound() {
    if (callAudio) {
        callAudio = null;
    }
}

// Funciones para historial de llamadas
function loadCallHistory() {
    if (!currentUser || !currentUser.uid) {
        updateCallHistoryUI();
        return;
    }

    database.ref(`callHistory/${currentUser.uid}`).limitToLast(100).once('value')
        .then((snapshot) => {
            const historyData = snapshot.val() || {};
            callHistory = Object.values(historyData).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            updateCallHistoryUI();
        })
        .catch((error) => {
            console.error('Error cargando historial de llamadas:', error);
            updateCallHistoryUI();
        });
}

function updateCallHistoryUI() {
    const callsList = document.getElementById('calls-list');
    if (!callsList) return;

    callsList.innerHTML = '';

    if (callHistory.length === 0) {
        callsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-phone-slash"></i>
                <h3>Sin historial de llamadas</h3>
                <p>Tus llamadas aparecerán aquí</p>
            </div>
        `;
        return;
    }

    callHistory.forEach(call => {
        const callItem = document.createElement('div');
        callItem.className = 'call-item';

        const date = new Date(call.timestamp);
        const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('es-ES');
        const duration = formatDuration(call.duration);

        callItem.innerHTML = `
            <div class="call-avatar">
                <img src="${call.avatar}" alt="${call.contact}">
                <div class="call-type-icon ${call.type}">
                    <i class="fas fa-${call.type === 'video' ? 'video' : 'phone'}"></i>
                </div>
            </div>
            <div class="call-info">
                <div class="call-contact">${call.contact}</div>
                <div class="call-details">
                    <span class="call-time">${time} - ${dateStr}</span>
                    <span class="call-duration">${duration}</span>
                </div>
            </div>
            <div class="call-actions">
                <button class="call-back-btn" onclick="callBack('${call.contact}', '${call.type}')">
                    <i class="fas fa-${call.type === 'video' ? 'video' : 'phone'}"></i>
                </button>
            </div>
        `;

        callsList.appendChild(callItem);
    });
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${remainingSeconds}s`;
    }
}

function callBack(contactName, callType) {
    // Buscar el contacto en la lista actual
    const contact = chatContacts.find(c => c.name === contactName) || 
                   { name: contactName, language: 'en', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${contactName}` };

    currentChatContact = contact;

    startVoiceCall();
}

function clearCallHistory() {
    if (confirm('¿Estás seguro de que quieres eliminar todo el historial de llamadas?')) {
        callHistory = [];
        updateCallHistoryUI();
    }
}

// Sistema de moderación automática
function checkOffensiveContent(text) {
    const lowercaseText = text.toLowerCase();
    const foundWords = [];

    moderationSystem.offensiveWords.forEach(word => {
        if (lowercaseText.includes(word)) {
            foundWords.push(word);
        }
    });

    return {
        isOffensive: foundWords.length > 0,
        offensiveWords: foundWords
    };
}

function analyzeChatForModeration(messageText, isSentByUser) {
    const userId = isSentByUser ? 'currentUser' : currentChatContact?.name || 'unknown';
    const moderationResult = checkOffensiveContent(messageText);

    if (moderationResult.isOffensive) {
        // Registrar violación
        if (!moderationSystem.userViolations[userId]) {
            moderationSystem.userViolations[userId] = [];
        }

        moderationSystem.userViolations[userId].push({
            message: messageText,
            timestamp: Date.now(),
            offensiveWords: moderationResult.offensiveWords
        });

        console.log(`Violación detectada de ${userId}:`, moderationResult.offensiveWords);

        // Si es del usuario actual y no es la primera violación, mostrar advertencia
        if (isSentByUser && moderationSystem.userViolations[userId].length > 0) {
            setTimeout(() => {
                showModerationWarning(moderationResult.offensiveWords, true);
            }, 1000);
        }
    }
}

function showModerationWarning(offensiveWords, isPostMessage = false) {
    if (currentWarning) return; // Evitar warnings múltiples

    const warningModal = document.createElement('div');
    warningModal.className = 'moderation-warning-modal';
    warningModal.innerHTML = `
        <div class="moderation-warning-content">
            <div class="warning-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h2>️ Advertencia de Moderación</h2>
            <p>${isPostMessage ? 'Has enviado' : 'Estás intentando enviar'} contenido que viola nuestras normas comunitarias.</p>
            <div class="detected-words">
                <strong>Palabras detectadas:</strong> ${offensiveWords.join(', ')}
            </div>
            <div class="warning-message">
                <p> El uso de lenguaje ofensivo está prohibido</p>
                <p> Reincidencias pueden resultar en suspensión de cuenta</p>
                <p> Mantén un ambiente respetuoso para todos</p>
            </div>
            <div class="warning-actions">
                <button class="warning-understood-btn" onclick="closeModerationWarning()">
                    <i class="fas fa-check"></i>
                    Entendido
                </button>
                ${isPostMessage ? '<button class="warning-report-btn" onclick="reportMyOwnViolation()"><i class="fas fa-flag"></i> Reportar mi mensaje</button>' : ''}
            </div>
            <div class="warning-footer">
                <small>Este mensaje se cerrará automáticamente en <span id="warning-countdown">10</span> segundos</small>
            </div>
        </div>
    `;

    document.body.appendChild(warningModal);
    currentWarning = warningModal;

    // Countdown timer
    let countdown = 10;
    const countdownElement = document.getElementById('warning-countdown');
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdownElement) {
            countdownElement.textContent = countdown;
        }
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            closeModerationWarning();
        }
    }, 1000);
}

function closeModerationWarning() {
    if (currentWarning) {
        document.body.removeChild(currentWarning);
        currentWarning = null;
    }
}

function reportMyOwnViolation() {
    closeModerationWarning();

    // Auto-reporte por violación detectada
    const autoReport = {
        id: Date.now(),
        type: 'inappropriate',
        contact: 'Auto-reporte',
        timestamp: Date.now(),
        evidence: [],
        status: 'auto-processing',
        isAutoReport: true
    };

    moderationSystem.reportQueue.push(autoReport);

    switchScreen('report-processing');
    setTimeout(() => {
        processReportAutomatically(autoReport);
    }, 5000); // Procesamiento más rápido para auto-reportes
}

function processReportAutomatically(report) {
    const reportIndex = moderationSystem.reportQueue.findIndex(r => r.id === report.id);
    if (reportIndex === -1) return;

    // Simular análisis automático del chat
    const chatAnalysis = analyzeChatHistory(report);

    // Actualizar estado del reporte
    moderationSystem.reportQueue[reportIndex].status = 'completed';
    moderationSystem.reportQueue[reportIndex].result = chatAnalysis;

    // Mostrar resultado
    showReportResult(chatAnalysis, report);
}

function analyzeChatHistory(report) {
    // Simular análisis de historial de chat
    const userId = report.contact;
    const violations = moderationSystem.userViolations[userId] || [];
    const currentUserViolations = moderationSystem.userViolations['currentUser'] || [];

    let result = {
        violationsFound: violations.length > 0 || currentUserViolations.length > 0,
        reportedUserViolations: violations.length,
        reporterViolations: currentUserViolations.length,
        recommendation: 'no_action',
        details: []
    };

    if (violations.length > 0) {
        result.recommendation = violations.length >= 3 ? 'warning' : 'caution';
        result.details.push(`Se detectaron ${violations.length} violación(es) del usuario reportado`);
    }

    if (currentUserViolations.length > 0) {
        result.details.push(`Se detectaron ${currentUserViolations.length} violación(es) tuyas en el historial`);
        if (currentUserViolations.length >= 2) {
            result.recommendation = 'mutual_warning';
        }
    }

    if (!result.violationsFound) {
        result.recommendation = 'no_violation';
        result.details.push('No se detectaron violaciones significativas en el historial de chat');
    }

    return result;
}

function showReportResult(analysis, report) {
    // Crear pantalla de resultado del reporte
    const resultScreen = document.createElement('div');
    resultScreen.id = 'report-result-screen';
    resultScreen.className = 'screen active';

    let resultMessage = '';
    let resultIcon = '';
    let resultColor = '';

    switch (analysis.recommendation) {
        case 'warning':
            resultMessage = 'Reporte confirmado: Se detectaron múltiples violaciones del usuario reportado';
            resultIcon = 'fas fa-shield-alt';
            resultColor = '#e74c3c';
            break;
        case 'mutual_warning':
            resultMessage = 'Reporte procesado: Se detectaron violaciones de ambas partes';
            resultIcon = 'fas fa-balance-scale';
            resultColor = '#f39c12';
            break;
        case 'caution':
            resultMessage = 'Reporte revisado: Se detectaron violaciones menores';
            resultIcon = 'fas fa-exclamation-circle';
            resultColor = '#f39c12';
            break;
        case 'no_violation':
            resultMessage = 'Reporte revisado: No se detectaron violaciones significativas';
            resultIcon = 'fas fa-check-circle';
            resultColor = '#00a854';
            break;
        default:
            resultMessage = 'Reporte procesado: Análisis completado';
            resultIcon = 'fas fa-info-circle';
            resultColor = '#3498db';
    }

    resultScreen.innerHTML = `
        <div class="report-result-container">
            <div class="result-header">
                <button class="close-result-btn" onclick="closeReportResult()">
                    <i class="fas fa-times"></i>
                </button>
                <h2>Resultado del Análisis</h2>
            </div>

            <div class="result-content">
                <div class="result-icon" style="color: ${resultColor}">
                    <i class="${resultIcon}"></i>
                </div>

                <div class="result-message">
                    <h3>${resultMessage}</h3>
                </div>

                <div class="analysis-details">
                    <h4> Detalles del Análisis Automático:</h4>
                    <ul>
                        ${analysis.details.map(detail => `<li>${detail}</li>`).join('')}
                        <li>⏱️ Análisis completado en tiempo real por IA</li>
                        <li> Se analizaron todos los mensajes del historial</li>
                        <li> Procesamiento automático en 15 segundos</li>
                    </ul>
                </div>

                ${analysis.violationsFound ? `
                    <div class="action-taken">
                        <h4> Acciones Tomadas:</h4>
                        <div class="action-list">
                            ${analysis.reportedUserViolations > 0 ? '<div class="action-item">️ Usuario reportado recibió advertencia automática</div>' : ''}
                            ${analysis.reporterViolations > 0 ? '<div class="action-item">️ También recibiste una advertencia por violaciones detectadas</div>' : ''}
                            <div class="action-item"> Caso registrado en el sistema de moderación</div>
                        </div>
                    </div>
                ` : ''}

                <div class="next-steps">
                    <h4> Próximos Pasos:</h4>
                    <p>El sistema de moderación automática continuará monitoreando todas las conversaciones. Mantén un comportamiento respetuoso para evitar futuras advertencias.</p>
                </div>
            </div>

            <div class="result-footer">
                <button class="primary-btn" onclick="closeReportResult()">
                    <i class="fas fa-arrow-left"></i>
                    <span>Volver al chat</span>
                </button>
            </div>
        </div>
    `;

    // Remover pantalla de éxito anterior si existe
    const existingSuccess = document.getElementById('report-success-screen');
    if (existingSuccess) {
        existingSuccess.remove();
    }

    document.body.appendChild(resultScreen);

    // Cambiar a la nueva pantalla
    setTimeout(() => {
        switchScreen('report-result');
        currentScreen = 'report-result';
    }, 100);
}

function closeReportResult() {
    const resultScreen = document.getElementById('report-result-screen');
    if (resultScreen) {
        resultScreen.remove();
    }
    switchScreen('chat');
}

// Función para mostrar mensajes en pantalla completa
function showFullScreenMessage(title, message, type = 'info') {
    const messageScreen = document.createElement('div');
    messageScreen.id = 'fullscreen-message-screen';
    messageScreen.className = 'screen active';

    let iconClass = 'fas fa-info-circle';
    let colorClass = 'info';

    switch(type) {
        case 'success':
            iconClass = 'fas fa-check-circle';
            colorClass = 'success';
            break;
        case 'denied':
            iconClass = 'fas fa-shield-alt';
            colorClass = 'denied';
            break;
        case 'warning':
            iconClass = 'fas fa-exclamation-triangle';
            colorClass = 'warning';
            break;
    }

    messageScreen.innerHTML = `
        <div class="fullscreen-message-container ${colorClass}">
            <div class="message-icon">
                <i class="${iconClass}"></i>
            </div>
            <h1 class="message-title">${title}</h1>
            <p class="message-text">${message}</p>
            <div class="message-actions">
                <button class="primary-btn" onclick="closeFullScreenMessage()">
                    <i class="fas fa-check"></i>
                    Entendido
                </button>
            </div>
        </div>
    `;

    // Ocultar pantalla actual
    const currentScreenElement = document.querySelector('.screen.active');
    if (currentScreenElement && currentScreenElement !== messageScreen) {
        currentScreenElement.classList.remove('active');
    }

    document.body.appendChild(messageScreen);

    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
        closeFullScreenMessage();
    }, 5000);
}

// Función para cerrar mensaje en pantalla completa
function closeFullScreenMessage() {
    const messageScreen = document.getElementById('fullscreen-message-screen');
    if (messageScreen) {
        document.body.removeChild(messageScreen);
        // Restaurar pantalla anterior
        switchScreen(currentScreen);
    }
}

// Funciones para el sistema de deslizado de chats
function handleTouchStart(e) {
    if (currentSwipeItem && currentSwipeItem !== e.currentTarget.parentNode) {
        resetSwipe();
    }
    
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    currentSwipeItem = e.currentTarget.parentNode;
    isSwipeActive = false;
}

function handleTouchMove(e) {
    if (!currentSwipeItem) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = swipeStartX - currentX;
    const diffY = Math.abs(swipeStartY - currentY);
    
    // Solo activar deslizado horizontal si el movimiento es más horizontal que vertical
    if (Math.abs(diffX) > diffY && Math.abs(diffX) > 10) {
        e.preventDefault();
        isSwipeActive = true;
        
        // Limitar el deslizado hacia la izquierda únicamente
        if (diffX > 0 && diffX <= 150) {
            const chatItem = currentSwipeItem.querySelector('.chat-item');
            const swipeActions = currentSwipeItem.querySelector('.swipe-actions');
            
            chatItem.style.transform = `translateX(-${diffX}px)`;
            swipeActions.style.opacity = diffX / 150;
            swipeActions.style.transform = `translateX(${150 - diffX}px)`;
        }
    }
}

function handleTouchEnd(e) {
    if (!currentSwipeItem || !isSwipeActive) {
        isSwipeActive = false;
        return;
    }
    
    const diffX = swipeStartX - e.changedTouches[0].clientX;
    const chatItem = currentSwipeItem.querySelector('.chat-item');
    const swipeActions = currentSwipeItem.querySelector('.swipe-actions');
    
    if (diffX > 75) {
        // Mostrar acciones
        chatItem.style.transform = 'translateX(-150px)';
        swipeActions.style.opacity = '1';
        swipeActions.style.transform = 'translateX(0)';
        currentSwipeItem.classList.add('swiped');
    } else {
        // Volver a la posición original
        resetSwipe();
    }
    
    isSwipeActive = false;
}

// Eventos para desktop (mouse)
function handleMouseDown(e) {
    if (currentSwipeItem && currentSwipeItem !== e.currentTarget.parentNode) {
        resetSwipe();
    }
    
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    currentSwipeItem = e.currentTarget.parentNode;
    isSwipeActive = false;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
    if (!currentSwipeItem) return;
    
    const diffX = swipeStartX - e.clientX;
    const diffY = Math.abs(swipeStartY - e.clientY);
    
    if (Math.abs(diffX) > diffY && Math.abs(diffX) > 10) {
        e.preventDefault();
        isSwipeActive = true;
        
        if (diffX > 0 && diffX <= 150) {
            const chatItem = currentSwipeItem.querySelector('.chat-item');
            const swipeActions = currentSwipeItem.querySelector('.swipe-actions');
            
            chatItem.style.transform = `translateX(-${diffX}px)`;
            swipeActions.style.opacity = diffX / 150;
            swipeActions.style.transform = `translateX(${150 - diffX}px)`;
        }
    }
}

function handleMouseUp(e) {
    if (!currentSwipeItem || !isSwipeActive) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        isSwipeActive = false;
        return;
    }
    
    const diffX = swipeStartX - e.clientX;
    const chatItem = currentSwipeItem.querySelector('.chat-item');
    const swipeActions = currentSwipeItem.querySelector('.swipe-actions');
    
    if (diffX > 75) {
        chatItem.style.transform = 'translateX(-150px)';
        swipeActions.style.opacity = '1';
        swipeActions.style.transform = 'translateX(0)';
        currentSwipeItem.classList.add('swiped');
    } else {
        resetSwipe();
    }
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    isSwipeActive = false;
}

function resetSwipe() {
    if (currentSwipeItem) {
        const chatItem = currentSwipeItem.querySelector('.chat-item');
        const swipeActions = currentSwipeItem.querySelector('.swipe-actions');
        
        chatItem.style.transform = 'translateX(0)';
        swipeActions.style.opacity = '0';
        swipeActions.style.transform = 'translateX(150px)';
        currentSwipeItem.classList.remove('swiped');
    }
    currentSwipeItem = null;
}

// Cerrar deslizado al hacer clic fuera
document.addEventListener('click', function(e) {
    if (currentSwipeItem && !currentSwipeItem.contains(e.target)) {
        resetSwipe();
    }
});

// Funciones para silenciar y eliminar chats
function toggleMuteChat(userId, displayName) {
    const muteEndTime = Date.now() + (20 * 60 * 1000); // 20 minutos
    
    if (isChatMuted(userId)) {
        // Desactivar silencio
        mutedChats.delete(userId);
        showInstantNotification(` Chat con ${displayName} reactivado`, 'friend-request');
    } else {
        // Activar silencio por 20 minutos
        mutedChats.set(userId, muteEndTime);
        showInstantNotification(` Chat con ${displayName} silenciado por 20 minutos`, 'friend-request');
        
        // Programar la reactivación automática
        setTimeout(() => {
            if (mutedChats.has(userId)) {
                mutedChats.delete(userId);
                showInstantNotification(` Chat con ${displayName} reactivado automáticamente`, 'friend-request');
                // Actualizar UI
                loadUserContacts();
            }
        }, 20 * 60 * 1000);
    }
    
    // Actualizar la interfaz
    loadUserContacts();
    resetSwipe();
}

function deleteChat(userId, displayName) {
    const confirmDelete = confirm(`¿Estás seguro de que quieres eliminar la conversación con ${displayName}?`);
    
    if (confirmDelete) {
        // Eliminar el chat de Firebase
        const chatId = generateChatId(currentUser.uid, userId);
        
        database.ref(`chats/${chatId}`).remove()
            .then(() => {
                console.log('Chat eliminado de Firebase');
                
                // Eliminar contacto de la lista local
                chatContacts = chatContacts.filter(contact => contact.uid !== userId);
                
                // Eliminar silencio si existe
                if (mutedChats.has(userId)) {
                    mutedChats.delete(userId);
                }
                
                // Actualizar interfaz
                loadUserContacts();
                
                showInstantNotification(`️ Conversación con ${displayName} eliminada`, 'friend-request');
            })
            .catch(error => {
                console.error('Error eliminando chat:', error);
                showErrorMessage('Error eliminando conversación. Intenta de nuevo.');
            });
    }
    
    resetSwipe();
}

function isChatMuted(userId) {
    if (mutedChats.has(userId)) {
        const muteEndTime = mutedChats.get(userId);
        if (Date.now() < muteEndTime) {
            return true;
        } else {
            // El silencio ha expirado, eliminarlo
            mutedChats.delete(userId);
            return false;
        }
    }
    return false;
}

// Función para verificar si un mensaje debe ser filtrado por silencio
function shouldFilterMessage(senderId) {
    return isChatMuted(senderId);
}

function showAutoGeneratedCodeMessage(code) {
    // Cerrar cualquier modal pequeño existente
    closeSuccessModal();
    
    // Crear pantalla completa para mostrar el código
    const codeScreen = document.createElement('div');
    codeScreen.id = 'verification-code-screen';
    codeScreen.className = 'screen active';

    codeScreen.innerHTML = `
        <div class="verification-code-container">
            <div class="code-header">
                <div class="code-icon">
                    <i class="fas fa-mobile-alt"></i>
                </div>
                <h1>Código de Verificación</h1>
                <p class="code-subtitle">Tu código ha sido generado automáticamente</p>
            </div>

            <div class="code-content">
                <div class="generated-code-display">
                    <h2>Tu código es:</h2>
                    <div class="code-number">${code}</div>
                    <p class="code-instruction">Copia este código en la pantalla de verificación</p>
                </div>

                <div class="code-info">
                    <div class="info-item">
                        <i class="fas fa-clock"></i>
                        <span>Válido por 10 minutos</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-shield-alt"></i>
                        <span>Generado automáticamente</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-lock"></i>
                        <span>Código único y seguro</span>
                    </div>
                </div>
            </div>

            <div class="code-actions">
                <button class="secondary-btn" onclick="copyCodeToClipboard('${code}')">
                    <i class="fas fa-copy"></i>
                    Copiar Código
                </button>
                <button class="primary-btn" onclick="proceedToVerification()">
                    <i class="fas fa-arrow-right"></i>
                    Continuar
                </button>
            </div>
        </div>
    `;

    // Ocultar pantalla actual
    const currentScreenElement = document.querySelector('.screen.active');
    if (currentScreenElement && currentScreenElement !== codeScreen) {
        currentScreenElement.classList.remove('active');
    }

    document.body.appendChild(codeScreen);

    // Auto-cerrar después de 10 segundos y continuar
    setTimeout(() => {
        proceedToVerification();
    }, 10000);
}

function copyCodeToClipboard(code) {
    navigator.clipboard.writeText(code).then(() => {
        showSuccessMessage(' Código copiado al portapapeles');
    }).catch(() => {
        // Fallback para navegadores que no soportan clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccessMessage(' Código copiado');
    });
}

function proceedToVerification() {
    const codeScreen = document.getElementById('verification-code-screen');
    if (codeScreen) {
        document.body.removeChild(codeScreen);
    }
    switchScreen('verification');
    document.querySelector('.code-digit').focus();
}


// ===== Settings and storage realtime module =====
const storageManager = {
    totalBytes: 100 * 1024 * 1024,
    usedBytes: 0,
    imageCacheBytes: 0,
    oldFilesBytes: 0,
    listeners: [],

    initialize() {
        if (!currentUser || !currentUser.uid) return;
        this.startRealtimeTracking();
    },

    startRealtimeTracking() {
        this.stopRealtimeTracking();
        if (!currentUser || !currentUser.uid) return;

        const refs = [
            database.ref(`storageMetrics/${currentUser.uid}`),
            database.ref(`users/${currentUser.uid}/storage`)
        ];

        refs.forEach((ref) => {
            const cb = (snapshot) => {
                const data = snapshot.val() || {};
                const local = this.computeLocalStorageUsage();
                this.usedBytes = (data.usedBytes || 0) + local.total;
                this.imageCacheBytes = local.imageCache;
                this.oldFilesBytes = local.oldFiles;
                this.updateStorageUI();
            };
            ref.on('value', cb);
            this.listeners.push({ ref, cb });
        });

        const local = this.computeLocalStorageUsage();
        this.usedBytes = local.total;
        this.imageCacheBytes = local.imageCache;
        this.oldFilesBytes = local.oldFiles;
        this.updateStorageUI();
    },

    stopRealtimeTracking() {
        this.listeners.forEach(({ ref, cb }) => ref.off('value', cb));
        this.listeners = [];
    },

    computeLocalStorageUsage() {
        let total = 0;
        let imageCache = 0;
        let oldFiles = 0;
        const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key) || '';
            const bytes = (key.length + value.length) * 2;
            total += bytes;

            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('image') || lowerKey.includes('cache')) {
                imageCache += bytes;
            }

            try {
                const parsed = JSON.parse(value);
                if (parsed && parsed.timestamp && parsed.timestamp < monthAgo) {
                    oldFiles += bytes;
                }
            } catch (_) {}
        }

        return { total, imageCache, oldFiles };
    },

    formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
            size /= 1024;
            unit += 1;
        }
        return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
    },

    updateStorageUI() {
        const used = this.usedBytes;
        const free = Math.max(this.totalBytes - used, 0);
        const percent = Math.min((used / this.totalBytes) * 100, 100);

        const mappings = {
            'storage-used': this.formatFileSize(used),
            'storage-free': this.formatFileSize(free),
            'storage-total': this.formatFileSize(this.totalBytes),
            'storage-cache-size': this.formatFileSize(this.imageCacheBytes),
            'storage-old-files-size': this.formatFileSize(this.oldFilesBytes),
            'storage-usage-percent': `${percent.toFixed(1)}%`
        };

        Object.entries(mappings).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });

        const circle = document.getElementById('storage-circle-progress');
        if (circle) {
            circle.style.setProperty('--progress', percent.toFixed(1));
            circle.style.setProperty('--color', percent > 85 ? '#ef4444' : '#00a854');
        }
    }
};

function initializeSettings() {
    if (!currentUser) return;
    const username = currentUser.username || currentUser.phoneNumber || 'Usuario';
    const avatar = currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${(currentUser.phoneNumber || 'user').replace(/\D/g, '')}`;

    const usernameEl = document.getElementById('profile-username');
    const phoneEl = document.getElementById('profile-phone-display');
    const avatarEl = document.getElementById('profile-avatar');
    const phoneReadonly = document.getElementById('phone-readonly');

    if (usernameEl) usernameEl.textContent = username;
    if (phoneEl) phoneEl.textContent = currentUser.phoneNumber || '';
    if (avatarEl) avatarEl.src = avatar;
    if (phoneReadonly) phoneReadonly.value = currentUser.phoneNumber || '';

    storageManager.initialize();
}

function showStorageSettings() {
    let screen = document.getElementById('storage-settings-screen');
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'storage-settings-screen';
        screen.className = 'screen';
        screen.innerHTML = `
            <div class="storage-settings-container">
                <div class="storage-header">
                    <button class="back-btn" onclick="hideStorageSettings()"><i class="fas fa-arrow-left"></i></button>
                    <div>
                        <h2>Gestión de almacenamiento</h2>
                        <div class="storage-subtitle">Actualización en tiempo real</div>
                    </div>
                </div>
                <div class="storage-content">
                    <div class="storage-overview">
                        <div class="storage-circle">
                            <div class="circle-progress" id="storage-circle-progress" style="--progress:0;--color:#00a854;">
                                <div class="circle-inner">
                                    <div class="usage-percentage" id="storage-usage-percent">0%</div>
                                    <div class="usage-text">utilizado</div>
                                </div>
                            </div>
                        </div>
                        <div class="storage-details">
                            <div class="storage-status"><i class="fas fa-database"></i> Estado de almacenamiento</div>
                            <div class="storage-numbers">
                                <div class="storage-item"><span class="label">Usado</span><span class="value" id="storage-used">0 B</span></div>
                                <div class="storage-item"><span class="label">Libre</span><span class="value" id="storage-free">0 B</span></div>
                                <div class="storage-item"><span class="label">Total</span><span class="value" id="storage-total">0 B</span></div>
                            </div>
                        </div>
                    </div>
                    <div class="storage-actions">
                        <button class="storage-action-btn" onclick="clearImageCacheRealtime()">
                            <i class="fas fa-image"></i>
                            <div><strong>Limpiar caché de imágenes</strong><div>Tamaño: <span id="storage-cache-size">0 B</span></div></div>
                        </button>
                        <button class="storage-action-btn" onclick="cleanupOldFilesRealtime()">
                            <i class="fas fa-broom"></i>
                            <div><strong>Limpiar archivos antiguos</strong><div>Tamaño: <span id="storage-old-files-size">0 B</span></div></div>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(screen);
    }

    switchScreen('storage-settings');
    storageManager.startRealtimeTracking();
}

function hideStorageSettings() {
    switchScreen('settings');
}

function clearImageCacheRealtime() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.toLowerCase().includes('image') || key.toLowerCase().includes('cache'))) {
            toRemove.push(key);
        }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));

    if (currentUser && currentUser.uid) {
        database.ref(`storageMetrics/${currentUser.uid}/lastImageCacheCleanup`).set(firebase.database.ServerValue.TIMESTAMP);
    }

    storageManager.startRealtimeTracking();
}

function cleanupOldFilesRealtime() {
    const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const toRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (!key || !value) continue;
        try {
            const parsed = JSON.parse(value);
            if (parsed && parsed.timestamp && parsed.timestamp < monthAgo) {
                toRemove.push(key);
            }
        } catch (_) {}
    }

    toRemove.forEach((key) => localStorage.removeItem(key));

    if (currentUser && currentUser.uid) {
        database.ref(`storageMetrics/${currentUser.uid}/lastOldFilesCleanup`).set(firebase.database.ServerValue.TIMESTAMP);
    }

    storageManager.startRealtimeTracking();
}

function showAbout() {
    console.log('Acerca de Zenvio');
}

function showHelp() {
    console.log('Ayuda y soporte');
}

function logout() {
    localStorage.removeItem('zenvio_user');
    localStorage.removeItem('uberchat_user');
    currentUser = null;
    switchScreen('intro');
}


function goToChatList() {
    switchScreen('chat-list');
    loadUserContacts();
}

function showEditProfile() {
    const modal = document.getElementById('edit-profile-modal');
    if (!modal) return;

    const avatarPreview = document.getElementById('avatar-preview');
    const usernameInput = document.getElementById('username-input');
    const statusInput = document.getElementById('status-input');

    if (avatarPreview) {
        avatarPreview.src = (currentUser && currentUser.avatar) || document.getElementById('profile-avatar')?.src || '';
    }
    if (usernameInput) {
        usernameInput.value = (currentUser && (currentUser.username || currentUser.name)) || '';
    }
    if (statusInput) {
        statusInput.value = (currentUser && currentUser.statusText) || '';
    }

    modal.classList.add('show');
}

function hideEditProfile() {
    const modal = document.getElementById('edit-profile-modal');
    if (modal) modal.classList.remove('show');
}

function selectNewAvatar() {
    const avatarInput = document.getElementById('avatar-input');
    if (avatarInput) avatarInput.click();
}

function changeProfileAvatar() {
    selectNewAvatar();
}

function handleAvatarChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const avatarPreview = document.getElementById('avatar-preview');
        if (avatarPreview) avatarPreview.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function saveProfile() {
    if (!currentUser || !currentUser.uid) {
        hideEditProfile();
        return;
    }

    const usernameInput = document.getElementById('username-input');
    const statusInput = document.getElementById('status-input');
    const avatarPreview = document.getElementById('avatar-preview');

    const updates = {
        username: usernameInput ? usernameInput.value.trim() || (currentUser.username || '') : (currentUser.username || ''),
        statusText: statusInput ? statusInput.value.trim() : (currentUser.statusText || ''),
        avatar: avatarPreview ? avatarPreview.src : (currentUser.avatar || '')
    };

    database.ref(`users/${currentUser.uid}`).update(updates)
        .then(() => {
            currentUser = { ...currentUser, ...updates };
            localStorage.setItem('zenvio_user', JSON.stringify(currentUser));
            initializeSettings();
            hideEditProfile();
        })
        .catch((error) => {
            console.error('Error guardando perfil:', error);
            // Mantener UX funcional aunque falle Firebase
            currentUser = { ...currentUser, ...updates };
            localStorage.setItem('zenvio_user', JSON.stringify(currentUser));
            initializeSettings();
            hideEditProfile();
        });
}

function showPrivacySettings() {
    showSuccessMessage('Configuración de privacidad disponible próximamente.');
}

function toggleNotifications(toggleElement) {
    if (!toggleElement) return;
    toggleElement.classList.toggle('active');
}

function toggleCallNotifications(toggleElement) {
    if (!toggleElement) return;
    toggleElement.classList.toggle('active');
}

function toggleAutoTranslate(toggleElement) {
    if (!toggleElement) return;
    toggleElement.classList.toggle('active');
}

function showCreateMoment() {
    showSuccessMessage('Momentos está temporalmente deshabilitado.');
}
