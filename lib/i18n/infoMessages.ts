import type { Locale } from "./config";

const english = {
  Contact: {
    metadataTitle: "Contact SmartTools",
    metadataDescription: "Send questions, product feedback, or bug reports to SmartTools support.",
    eyebrow: "Contact",
    heading: "We’d love to hear from you.",
    description: "Questions, feedback, or a bug to report? Send a note and we’ll reply within one business day.",
    emailTitle: "Email us",
    emailUnavailable: "Support email not configured",
    helpTitle: "Help center",
    helpDescription: "Browse guides & FAQs",
    responseTitle: "Response time",
    responseDescription: "Within 1 business day",
    unavailableError: "Contact isn’t set up yet. Please use the help resources instead.",
    incompleteError: "Complete every field before sending your message.",
    successTitle: "Message ready",
    successDescription:
      "Your email app should be open with the message filled in. Send it there and we’ll reply within one business day.",
    writeAnother: "Write another message",
    unavailableTitle: "Contact isn’t set up yet",
    unavailableDescription:
      "No support email has been configured for this deployment. You can keep using every tool without an account.",
    nameLabel: "Name",
    emailLabel: "Email",
    subjectLabel: "Subject",
    subjectPlaceholder: "How can we help?",
    messageLabel: "Message",
    messagePlaceholder: "Tell us a little about what you need…",
    sending: "Sending…",
    send: "Send message",
    requiredField: "Please complete this field.",
    invalidEmail: "Enter a valid email address.",
  },
  Privacy: {
    metadataTitle: "Privacy Policy | SmartTools",
    metadataDescription: "How SmartTools handles documents, account information, cookies, and your data controls.",
    updated: "Legal · Updated September 2026",
    heading: "Privacy Policy",
    description:
      "A plain-language summary of how SmartTools handles your information across Paperwork, DevTools, Media, and account features.",
    informationTitle: "Information we collect",
    informationBody:
      "The content you process with public SmartTools is handled in your browser unless a tool clearly says otherwise. If you create an account, we store your name and email to provide account features and sync supported history.",
    limitsTitle: "What we don’t do",
    limitsBody:
      "We don’t sell your data, run third-party ad trackers, or ask for more information than we need to operate SmartTools.",
    cookiesTitle: "Cookies",
    cookiesBody:
      "We use a small number of essential cookies for sessions, security, and preferences. With your permission, we also use optional analytics cookies. We do not use advertising cookies.",
    rightsTitle: "Your rights",
    rightsBody: "You can export or delete your account and its associated data at any time from your profile settings.",
  },
  About: {
    metadataTitle: "About Paperwork",
    metadataDescription: "Learn how SmartTools Paperwork helps small businesses create dependable documents quickly.",
    description: "Fast, focused document tools for freelancers, contractors, and small businesses.",
    eyebrow: "About",
    heading: "Paperwork without accounting-suite overhead",
    focusTitle: "Built for one job at a time",
    focusBody:
      "Paperwork provides focused generators for invoices, receipts, expense reports, mileage logs, tax estimates, W-9 requests, and 1099 tracking. Each tool keeps its primary action and output visible without requiring a complex accounting setup.",
    prioritiesTitle: "What we optimize for",
    prioritiesBody:
      "Clear validation, accurate previews, dependable exports, accessible controls, and plain explanations of where your data is stored.",
    back: "Back to Paperwork tools",
  },
  Terms: {
    metadataTitle: "Paperwork Terms",
    metadataDescription: "Review the current usage terms and limitations for SmartTools Paperwork.",
    description:
      "Use Paperwork as a document-preparation aid and verify important outputs before sending or filing them.",
    eyebrow: "Terms",
    heading: "Practical terms for using Paperwork",
    controlTitle: "You control the final document",
    controlBody:
      "Review names, dates, totals, tax settings, payment details, and exported files before sharing them. You are responsible for the information you enter and the documents you issue.",
    adviceTitle: "Not professional advice",
    adviceBody:
      "Paperwork does not provide legal, accounting, payroll, or tax advice. Consult a qualified professional for obligations specific to your business or location.",
    availabilityTitle: "Availability",
    availabilityBody:
      "Features may change as the toolkit improves. Keep your own copies of documents and records that matter to your business.",
  },
};

type InfoMessages = { [Namespace in keyof typeof english]: { [Key in keyof (typeof english)[Namespace]]: string } };

const messages: Record<Locale, InfoMessages> = {
  en: english,
  hi: {
    Contact: {
      metadataTitle: "SmartTools से संपर्क करें",
      metadataDescription: "SmartTools सहायता को सवाल, उत्पाद पर सुझाव या त्रुटि रिपोर्ट भेजें।",
      eyebrow: "संपर्क",
      heading: "हम आपकी बात सुनना चाहेंगे।",
      description: "कोई सवाल, सुझाव या त्रुटि बतानी है? संदेश भेजें, हम एक कार्यदिवस के भीतर जवाब देंगे।",
      emailTitle: "हमें ईमेल करें",
      emailUnavailable: "सहायता ईमेल कॉन्फ़िगर नहीं है",
      helpTitle: "सहायता केंद्र",
      helpDescription: "मार्गदर्शिकाएँ और आम सवाल देखें",
      responseTitle: "जवाब देने का समय",
      responseDescription: "1 कार्यदिवस के भीतर",
      unavailableError: "संपर्क सुविधा अभी तैयार नहीं है। कृपया सहायता संसाधनों का उपयोग करें।",
      incompleteError: "संदेश भेजने से पहले सभी फ़ील्ड भरें।",
      successTitle: "संदेश तैयार है",
      successDescription:
        "आपका ईमेल ऐप भरे हुए संदेश के साथ खुल जाना चाहिए। वहाँ से भेजें, हम एक कार्यदिवस के भीतर जवाब देंगे।",
      writeAnother: "एक और संदेश लिखें",
      unavailableTitle: "संपर्क सुविधा अभी तैयार नहीं है",
      unavailableDescription:
        "इस परिनियोजन के लिए सहायता ईमेल कॉन्फ़िगर नहीं किया गया है। आप बिना खाते के सभी टूल इस्तेमाल कर सकते हैं।",
      nameLabel: "नाम",
      emailLabel: "ईमेल",
      subjectLabel: "विषय",
      subjectPlaceholder: "हम कैसे मदद कर सकते हैं?",
      messageLabel: "संदेश",
      messagePlaceholder: "बताएँ कि आपको किस मदद की ज़रूरत है…",
      sending: "भेजा जा रहा है…",
      send: "संदेश भेजें",
      requiredField: "कृपया यह फ़ील्ड भरें।",
      invalidEmail: "मान्य ईमेल पता दर्ज करें।",
    },
    Privacy: {
      metadataTitle: "गोपनीयता नीति | SmartTools",
      metadataDescription:
        "SmartTools आपके दस्तावेज़ों, खाते की जानकारी, कुकीज़ और डेटा नियंत्रणों को कैसे संभालता है।",
      updated: "कानूनी · सितंबर 2026 में अपडेट किया गया",
      heading: "गोपनीयता नीति",
      description:
        "Paperwork, DevTools, Media और खाता सुविधाओं में SmartTools आपकी जानकारी कैसे संभालता है, इसका सरल भाषा में सारांश।",
      informationTitle: "हम कौन-सी जानकारी एकत्र करते हैं",
      informationBody:
        "सार्वजनिक SmartTools से आप जिस सामग्री को प्रोसेस करते हैं, उसे आपके ब्राउज़र में संभाला जाता है, जब तक टूल स्पष्ट रूप से कुछ और न बताए। यदि आप खाता बनाते हैं, तो खाता सुविधाएँ देने और समर्थित इतिहास सिंक करने के लिए हम आपका नाम और ईमेल रखते हैं।",
      limitsTitle: "हम क्या नहीं करते",
      limitsBody:
        "हम आपका डेटा नहीं बेचते, तृतीय-पक्ष विज्ञापन ट्रैकर नहीं चलाते और SmartTools संचालित करने के लिए आवश्यक जानकारी से अधिक नहीं माँगते।",
      cookiesTitle: "कुकीज़",
      cookiesBody:
        "हम सत्र, सुरक्षा और प्राथमिकताओं के लिए थोड़ी-सी आवश्यक कुकीज़ इस्तेमाल करते हैं। आपकी अनुमति से वैकल्पिक विश्लेषण कुकीज़ भी इस्तेमाल करते हैं। हम विज्ञापन कुकीज़ इस्तेमाल नहीं करते।",
      rightsTitle: "आपके अधिकार",
      rightsBody:
        "आप अपनी प्रोफ़ाइल सेटिंग से किसी भी समय अपना खाता और उससे जुड़ा डेटा निर्यात कर सकते हैं या मिटा सकते हैं।",
    },
    About: {
      metadataTitle: "Paperwork के बारे में",
      metadataDescription:
        "जानें कि SmartTools Paperwork छोटे व्यवसायों को भरोसेमंद दस्तावेज़ जल्दी बनाने में कैसे मदद करता है।",
      description: "फ़्रीलांसरों, ठेकेदारों और छोटे व्यवसायों के लिए तेज़, केंद्रित दस्तावेज़ टूल।",
      eyebrow: "परिचय",
      heading: "जटिल अकाउंटिंग सुइट के बिना Paperwork",
      focusTitle: "एक समय में एक काम के लिए बनाया गया",
      focusBody:
        "Paperwork इनवॉइस, रसीदें, खर्च रिपोर्ट, माइलेज लॉग, कर अनुमान, W-9 अनुरोध और 1099 ट्रैकिंग के लिए केंद्रित जनरेटर देता है। हर टूल जटिल अकाउंटिंग सेटअप की ज़रूरत के बिना अपनी मुख्य कार्रवाई और आउटपुट सामने रखता है।",
      prioritiesTitle: "हम किन बातों को बेहतर बनाते हैं",
      prioritiesBody:
        "स्पष्ट सत्यापन, सटीक पूर्वावलोकन, भरोसेमंद निर्यात, सुलभ नियंत्रण और आपका डेटा कहाँ संग्रहीत है इसकी सरल व्याख्या।",
      back: "Paperwork टूल पर वापस जाएँ",
    },
    Terms: {
      metadataTitle: "Paperwork की शर्तें",
      metadataDescription: "SmartTools Paperwork की वर्तमान उपयोग शर्तें और सीमाएँ देखें।",
      description:
        "Paperwork को दस्तावेज़ तैयार करने में सहायक की तरह इस्तेमाल करें और महत्वपूर्ण आउटपुट भेजने या दाखिल करने से पहले जाँच लें।",
      eyebrow: "शर्तें",
      heading: "Paperwork इस्तेमाल करने की व्यावहारिक शर्तें",
      controlTitle: "अंतिम दस्तावेज़ आपके नियंत्रण में है",
      controlBody:
        "साझा करने से पहले नाम, तारीखें, कुल राशि, कर सेटिंग, भुगतान विवरण और निर्यात की गई फ़ाइलें जाँचें। दर्ज की गई जानकारी और जारी किए गए दस्तावेज़ों की ज़िम्मेदारी आपकी है।",
      adviceTitle: "पेशेवर सलाह नहीं",
      adviceBody:
        "Paperwork कानूनी, अकाउंटिंग, वेतन या कर संबंधी सलाह नहीं देता। अपने व्यवसाय या स्थान से जुड़े दायित्वों के लिए योग्य पेशेवर से सलाह लें।",
      availabilityTitle: "उपलब्धता",
      availabilityBody:
        "टूलकिट बेहतर होने के साथ सुविधाएँ बदल सकती हैं। अपने व्यवसाय के महत्वपूर्ण दस्तावेज़ों और रिकॉर्ड की अपनी प्रतियाँ रखें।",
    },
  },
  es: {
    Contact: {
      metadataTitle: "Contactar con SmartTools",
      metadataDescription:
        "Envía preguntas, comentarios sobre el producto o informes de errores al soporte de SmartTools.",
      eyebrow: "Contacto",
      heading: "Nos encantará saber de ti.",
      description:
        "¿Tienes preguntas, comentarios o un error que comunicar? Escríbenos y responderemos en un día laborable.",
      emailTitle: "Escríbenos por correo",
      emailUnavailable: "Correo de soporte sin configurar",
      helpTitle: "Centro de ayuda",
      helpDescription: "Consulta guías y preguntas frecuentes",
      responseTitle: "Tiempo de respuesta",
      responseDescription: "En 1 día laborable",
      unavailableError: "El contacto aún no está configurado. Utiliza los recursos de ayuda.",
      incompleteError: "Completa todos los campos antes de enviar tu mensaje.",
      successTitle: "Mensaje preparado",
      successDescription:
        "Tu aplicación de correo debería abrirse con el mensaje rellenado. Envíalo desde allí y responderemos en un día laborable.",
      writeAnother: "Escribir otro mensaje",
      unavailableTitle: "El contacto aún no está configurado",
      unavailableDescription:
        "No se ha configurado un correo de soporte para esta instalación. Puedes seguir usando todas las herramientas sin una cuenta.",
      nameLabel: "Nombre",
      emailLabel: "Correo electrónico",
      subjectLabel: "Asunto",
      subjectPlaceholder: "¿Cómo podemos ayudarte?",
      messageLabel: "Mensaje",
      messagePlaceholder: "Cuéntanos qué necesitas…",
      sending: "Enviando…",
      send: "Enviar mensaje",
      requiredField: "Completa este campo.",
      invalidEmail: "Introduce una dirección de correo válida.",
    },
    Privacy: {
      metadataTitle: "Política de privacidad | SmartTools",
      metadataDescription:
        "Cómo gestiona SmartTools los documentos, la información de la cuenta, las cookies y los controles de tus datos.",
      updated: "Legal · Actualizada en septiembre de 2026",
      heading: "Política de privacidad",
      description:
        "Un resumen en lenguaje sencillo de cómo gestiona SmartTools tu información en Paperwork, DevTools, Media y las funciones de cuenta.",
      informationTitle: "Información que recopilamos",
      informationBody:
        "El contenido que procesas con las herramientas públicas de SmartTools se gestiona en tu navegador, salvo que una herramienta indique claramente lo contrario. Si creas una cuenta, guardamos tu nombre y correo para ofrecer las funciones de cuenta y sincronizar el historial compatible.",
      limitsTitle: "Lo que no hacemos",
      limitsBody:
        "No vendemos tus datos, no usamos rastreadores publicitarios de terceros ni pedimos más información de la necesaria para operar SmartTools.",
      cookiesTitle: "Cookies",
      cookiesBody:
        "Usamos unas pocas cookies esenciales para las sesiones, la seguridad y las preferencias. Con tu permiso, también usamos cookies opcionales de análisis. No usamos cookies publicitarias.",
      rightsTitle: "Tus derechos",
      rightsBody:
        "Puedes exportar o eliminar tu cuenta y los datos asociados en cualquier momento desde los ajustes de tu perfil.",
    },
    About: {
      metadataTitle: "Acerca de Paperwork",
      metadataDescription:
        "Descubre cómo SmartTools Paperwork ayuda a las pequeñas empresas a crear documentos fiables rápidamente.",
      description: "Herramientas documentales rápidas y específicas para autónomos, contratistas y pequeñas empresas.",
      eyebrow: "Acerca de",
      heading: "Paperwork sin la complejidad de una suite contable",
      focusTitle: "Diseñado para una tarea a la vez",
      focusBody:
        "Paperwork ofrece generadores específicos de facturas, recibos, informes de gastos, registros de kilometraje, estimaciones fiscales, solicitudes W-9 y seguimiento de formularios 1099. Cada herramienta mantiene visibles su acción principal y su resultado sin requerir una configuración contable compleja.",
      prioritiesTitle: "Nuestras prioridades",
      prioritiesBody:
        "Validaciones claras, vistas previas precisas, exportaciones fiables, controles accesibles y explicaciones sencillas sobre dónde se guardan tus datos.",
      back: "Volver a las herramientas de Paperwork",
    },
    Terms: {
      metadataTitle: "Condiciones de Paperwork",
      metadataDescription: "Consulta las condiciones de uso y limitaciones vigentes de SmartTools Paperwork.",
      description:
        "Usa Paperwork como ayuda para preparar documentos y verifica los resultados importantes antes de enviarlos o presentarlos.",
      eyebrow: "Condiciones",
      heading: "Condiciones prácticas para usar Paperwork",
      controlTitle: "Tú controlas el documento final",
      controlBody:
        "Revisa nombres, fechas, totales, ajustes fiscales, datos de pago y archivos exportados antes de compartirlos. Eres responsable de la información que introduces y de los documentos que emites.",
      adviceTitle: "No es asesoramiento profesional",
      adviceBody:
        "Paperwork no ofrece asesoramiento legal, contable, laboral ni fiscal. Consulta a un profesional cualificado sobre las obligaciones específicas de tu empresa o ubicación.",
      availabilityTitle: "Disponibilidad",
      availabilityBody:
        "Las funciones pueden cambiar a medida que mejoran las herramientas. Guarda tus propias copias de los documentos y registros importantes para tu empresa.",
    },
  },
  fr: {
    Contact: {
      metadataTitle: "Contacter SmartTools",
      metadataDescription:
        "Envoyez vos questions, avis sur le produit ou signalements de bugs à l’assistance SmartTools.",
      eyebrow: "Contact",
      heading: "Nous serions ravis de vous lire.",
      description: "Une question, un avis ou un bug à signaler ? Écrivez-nous et nous répondrons sous un jour ouvré.",
      emailTitle: "Nous écrire",
      emailUnavailable: "Adresse d’assistance non configurée",
      helpTitle: "Centre d’aide",
      helpDescription: "Consulter les guides et la FAQ",
      responseTitle: "Délai de réponse",
      responseDescription: "Sous 1 jour ouvré",
      unavailableError: "Le contact n’est pas encore configuré. Veuillez utiliser les ressources d’aide.",
      incompleteError: "Remplissez tous les champs avant d’envoyer votre message.",
      successTitle: "Message prêt",
      successDescription:
        "Votre application de messagerie devrait s’ouvrir avec le message prérempli. Envoyez-le depuis cette application et nous répondrons sous un jour ouvré.",
      writeAnother: "Écrire un autre message",
      unavailableTitle: "Le contact n’est pas encore configuré",
      unavailableDescription:
        "Aucune adresse d’assistance n’a été configurée pour cette installation. Vous pouvez continuer à utiliser tous les outils sans compte.",
      nameLabel: "Nom",
      emailLabel: "Adresse e-mail",
      subjectLabel: "Objet",
      subjectPlaceholder: "Comment pouvons-nous vous aider ?",
      messageLabel: "Message",
      messagePlaceholder: "Dites-nous ce dont vous avez besoin…",
      sending: "Envoi…",
      send: "Envoyer le message",
      requiredField: "Veuillez remplir ce champ.",
      invalidEmail: "Saisissez une adresse e-mail valide.",
    },
    Privacy: {
      metadataTitle: "Politique de confidentialité | SmartTools",
      metadataDescription:
        "Comment SmartTools gère les documents, les informations de compte, les cookies et le contrôle de vos données.",
      updated: "Mentions légales · Mise à jour en septembre 2026",
      heading: "Politique de confidentialité",
      description:
        "Un résumé en langage clair de la gestion de vos informations par SmartTools dans Paperwork, DevTools, Media et les fonctionnalités de compte.",
      informationTitle: "Informations collectées",
      informationBody:
        "Le contenu que vous traitez avec les outils publics SmartTools est géré dans votre navigateur, sauf indication contraire explicite de l’outil. Si vous créez un compte, nous conservons votre nom et votre adresse e-mail pour fournir les fonctionnalités du compte et synchroniser l’historique pris en charge.",
      limitsTitle: "Ce que nous ne faisons pas",
      limitsBody:
        "Nous ne vendons pas vos données, n’utilisons pas de traceurs publicitaires tiers et ne demandons pas plus d’informations que nécessaire au fonctionnement de SmartTools.",
      cookiesTitle: "Cookies",
      cookiesBody:
        "Nous utilisons quelques cookies essentiels pour les sessions, la sécurité et les préférences. Avec votre autorisation, nous utilisons également des cookies d’analyse facultatifs. Nous n’utilisons pas de cookies publicitaires.",
      rightsTitle: "Vos droits",
      rightsBody:
        "Vous pouvez exporter ou supprimer votre compte et les données associées à tout moment depuis les paramètres de votre profil.",
    },
    About: {
      metadataTitle: "À propos de Paperwork",
      metadataDescription:
        "Découvrez comment SmartTools Paperwork aide les petites entreprises à créer rapidement des documents fiables.",
      description:
        "Des outils documentaires rapides et ciblés pour les indépendants, les prestataires et les petites entreprises.",
      eyebrow: "À propos",
      heading: "Paperwork sans la complexité d’une suite comptable",
      focusTitle: "Conçu pour une tâche à la fois",
      focusBody:
        "Paperwork propose des générateurs ciblés de factures, reçus, notes de frais, relevés kilométriques, estimations fiscales, demandes W-9 et suivi des formulaires 1099. Chaque outil garde son action principale et son résultat visibles sans nécessiter de configuration comptable complexe.",
      prioritiesTitle: "Nos priorités",
      prioritiesBody:
        "Une validation claire, des aperçus précis, des exports fiables, des commandes accessibles et des explications simples sur le stockage de vos données.",
      back: "Retour aux outils Paperwork",
    },
    Terms: {
      metadataTitle: "Conditions de Paperwork",
      metadataDescription: "Consultez les conditions d’utilisation et les limites actuelles de SmartTools Paperwork.",
      description:
        "Utilisez Paperwork comme aide à la préparation de documents et vérifiez les résultats importants avant de les envoyer ou de les déposer.",
      eyebrow: "Conditions",
      heading: "Conditions pratiques d’utilisation de Paperwork",
      controlTitle: "Vous contrôlez le document final",
      controlBody:
        "Vérifiez les noms, dates, totaux, paramètres fiscaux, coordonnées de paiement et fichiers exportés avant de les partager. Vous êtes responsable des informations saisies et des documents émis.",
      adviceTitle: "Pas de conseil professionnel",
      adviceBody:
        "Paperwork ne fournit aucun conseil juridique, comptable, salarial ou fiscal. Consultez un professionnel qualifié pour les obligations propres à votre entreprise ou à votre lieu d’activité.",
      availabilityTitle: "Disponibilité",
      availabilityBody:
        "Les fonctionnalités peuvent évoluer à mesure que les outils s’améliorent. Conservez vos propres copies des documents et dossiers importants pour votre entreprise.",
    },
  },
  de: {
    Contact: {
      metadataTitle: "SmartTools kontaktieren",
      metadataDescription: "Sende Fragen, Produktfeedback oder Fehlerberichte an den SmartTools-Support.",
      eyebrow: "Kontakt",
      heading: "Wir freuen uns auf deine Nachricht.",
      description: "Fragen, Feedback oder ein Fehler? Schreib uns, und wir antworten innerhalb eines Werktags.",
      emailTitle: "E-Mail senden",
      emailUnavailable: "Support-E-Mail nicht eingerichtet",
      helpTitle: "Hilfecenter",
      helpDescription: "Anleitungen und häufige Fragen ansehen",
      responseTitle: "Antwortzeit",
      responseDescription: "Innerhalb von 1 Werktag",
      unavailableError: "Die Kontaktfunktion ist noch nicht eingerichtet. Nutze bitte die Hilferessourcen.",
      incompleteError: "Fülle alle Felder aus, bevor du deine Nachricht sendest.",
      successTitle: "Nachricht vorbereitet",
      successDescription:
        "Dein E-Mail-Programm sollte mit der ausgefüllten Nachricht geöffnet werden. Sende sie dort ab, und wir antworten innerhalb eines Werktags.",
      writeAnother: "Weitere Nachricht schreiben",
      unavailableTitle: "Kontaktfunktion noch nicht eingerichtet",
      unavailableDescription:
        "Für diese Installation wurde keine Support-E-Mail eingerichtet. Du kannst weiterhin alle Werkzeuge ohne Konto nutzen.",
      nameLabel: "Name",
      emailLabel: "E-Mail",
      subjectLabel: "Betreff",
      subjectPlaceholder: "Wie können wir helfen?",
      messageLabel: "Nachricht",
      messagePlaceholder: "Beschreibe kurz, was du brauchst…",
      sending: "Wird gesendet…",
      send: "Nachricht senden",
      requiredField: "Bitte fülle dieses Feld aus.",
      invalidEmail: "Gib eine gültige E-Mail-Adresse ein.",
    },
    Privacy: {
      metadataTitle: "Datenschutzerklärung | SmartTools",
      metadataDescription: "Wie SmartTools mit Dokumenten, Kontodaten, Cookies und deinen Datenkontrollen umgeht.",
      updated: "Rechtliches · Aktualisiert im September 2026",
      heading: "Datenschutzerklärung",
      description:
        "Eine verständliche Zusammenfassung zum Umgang von SmartTools mit deinen Daten in Paperwork, DevTools, Media und den Kontofunktionen.",
      informationTitle: "Welche Informationen wir erfassen",
      informationBody:
        "Inhalte, die du mit öffentlichen SmartTools verarbeitest, werden in deinem Browser verarbeitet, sofern ein Werkzeug nicht ausdrücklich etwas anderes angibt. Wenn du ein Konto erstellst, speichern wir deinen Namen und deine E-Mail-Adresse, um Kontofunktionen bereitzustellen und unterstützte Verlaufsdaten zu synchronisieren.",
      limitsTitle: "Was wir nicht tun",
      limitsBody:
        "Wir verkaufen deine Daten nicht, verwenden keine Werbetracker von Drittanbietern und fragen nur nach Informationen, die wir für den Betrieb von SmartTools benötigen.",
      cookiesTitle: "Cookies",
      cookiesBody:
        "Wir verwenden wenige notwendige Cookies für Sitzungen, Sicherheit und Einstellungen. Mit deiner Erlaubnis verwenden wir auch optionale Analyse-Cookies. Wir verwenden keine Werbe-Cookies.",
      rightsTitle: "Deine Rechte",
      rightsBody:
        "Du kannst dein Konto und die zugehörigen Daten jederzeit in deinen Profileinstellungen exportieren oder löschen.",
    },
    About: {
      metadataTitle: "Über Paperwork",
      metadataDescription:
        "Erfahre, wie SmartTools Paperwork kleinen Unternehmen hilft, schnell verlässliche Dokumente zu erstellen.",
      description:
        "Schnelle, spezialisierte Dokumentwerkzeuge für Selbstständige, Auftragnehmer und kleine Unternehmen.",
      eyebrow: "Über uns",
      heading: "Paperwork ohne die Komplexität einer Buchhaltungssuite",
      focusTitle: "Für eine Aufgabe nach der anderen entwickelt",
      focusBody:
        "Paperwork bietet spezialisierte Generatoren für Rechnungen, Quittungen, Spesenabrechnungen, Fahrtenbücher, Steuerschätzungen, W-9-Anfragen und die Verwaltung von 1099-Formularen. Jedes Werkzeug hält seine Hauptaktion und das Ergebnis sichtbar, ohne eine komplexe Buchhaltungseinrichtung zu erfordern.",
      prioritiesTitle: "Worauf wir Wert legen",
      prioritiesBody:
        "Klare Validierung, genaue Vorschauen, verlässliche Exporte, barrierefreie Bedienelemente und verständliche Erklärungen zum Speicherort deiner Daten.",
      back: "Zurück zu den Paperwork-Werkzeugen",
    },
    Terms: {
      metadataTitle: "Paperwork-Nutzungsbedingungen",
      metadataDescription: "Lies die aktuellen Nutzungsbedingungen und Einschränkungen von SmartTools Paperwork.",
      description:
        "Nutze Paperwork als Hilfe zur Dokumenterstellung und prüfe wichtige Ergebnisse vor dem Versenden oder Einreichen.",
      eyebrow: "Nutzungsbedingungen",
      heading: "Praktische Bedingungen für die Nutzung von Paperwork",
      controlTitle: "Du kontrollierst das endgültige Dokument",
      controlBody:
        "Prüfe Namen, Daten, Summen, Steuereinstellungen, Zahlungsangaben und exportierte Dateien vor dem Teilen. Du bist für die eingegebenen Informationen und ausgestellten Dokumente verantwortlich.",
      adviceTitle: "Keine professionelle Beratung",
      adviceBody:
        "Paperwork bietet keine Rechts-, Buchhaltungs-, Lohnabrechnungs- oder Steuerberatung. Wende dich bei Pflichten, die dein Unternehmen oder deinen Standort betreffen, an eine qualifizierte Fachkraft.",
      availabilityTitle: "Verfügbarkeit",
      availabilityBody:
        "Funktionen können sich mit der Weiterentwicklung der Werkzeuge ändern. Bewahre eigene Kopien der für dein Unternehmen wichtigen Dokumente und Unterlagen auf.",
    },
  },
  "pt-BR": {
    Contact: {
      metadataTitle: "Entre em contato com o SmartTools",
      metadataDescription: "Envie dúvidas, comentários sobre o produto ou relatos de erros ao suporte do SmartTools.",
      eyebrow: "Contato",
      heading: "Adoraríamos ouvir você.",
      description:
        "Tem dúvidas, sugestões ou um erro para relatar? Envie uma mensagem e responderemos em até um dia útil.",
      emailTitle: "Envie um e-mail",
      emailUnavailable: "E-mail de suporte não configurado",
      helpTitle: "Central de ajuda",
      helpDescription: "Consulte guias e perguntas frequentes",
      responseTitle: "Tempo de resposta",
      responseDescription: "Em até 1 dia útil",
      unavailableError: "O contato ainda não está configurado. Use os recursos de ajuda.",
      incompleteError: "Preencha todos os campos antes de enviar sua mensagem.",
      successTitle: "Mensagem pronta",
      successDescription:
        "Seu aplicativo de e-mail deve abrir com a mensagem preenchida. Envie por lá e responderemos em até um dia útil.",
      writeAnother: "Escrever outra mensagem",
      unavailableTitle: "O contato ainda não está configurado",
      unavailableDescription:
        "Nenhum e-mail de suporte foi configurado para esta instalação. Você pode continuar usando todas as ferramentas sem uma conta.",
      nameLabel: "Nome",
      emailLabel: "E-mail",
      subjectLabel: "Assunto",
      subjectPlaceholder: "Como podemos ajudar?",
      messageLabel: "Mensagem",
      messagePlaceholder: "Conte um pouco sobre o que você precisa…",
      sending: "Enviando…",
      send: "Enviar mensagem",
      requiredField: "Preencha este campo.",
      invalidEmail: "Insira um endereço de e-mail válido.",
    },
    Privacy: {
      metadataTitle: "Política de privacidade | SmartTools",
      metadataDescription:
        "Como o SmartTools lida com documentos, informações da conta, cookies e controles dos seus dados.",
      updated: "Informações legais · Atualizada em setembro de 2026",
      heading: "Política de privacidade",
      description:
        "Um resumo em linguagem simples de como o SmartTools trata suas informações no Paperwork, DevTools, Media e nos recursos da conta.",
      informationTitle: "Informações que coletamos",
      informationBody:
        "O conteúdo processado nas ferramentas públicas do SmartTools é tratado no seu navegador, a menos que uma ferramenta informe claramente o contrário. Se você criar uma conta, armazenamos seu nome e e-mail para oferecer os recursos da conta e sincronizar o histórico compatível.",
      limitsTitle: "O que não fazemos",
      limitsBody:
        "Não vendemos seus dados, não usamos rastreadores de anúncios de terceiros nem solicitamos mais informações do que precisamos para operar o SmartTools.",
      cookiesTitle: "Cookies",
      cookiesBody:
        "Usamos poucos cookies essenciais para sessões, segurança e preferências. Com sua permissão, também usamos cookies opcionais de análise. Não usamos cookies de publicidade.",
      rightsTitle: "Seus direitos",
      rightsBody:
        "Você pode exportar ou excluir sua conta e os dados associados a qualquer momento nas configurações do perfil.",
    },
    About: {
      metadataTitle: "Sobre o Paperwork",
      metadataDescription:
        "Saiba como o SmartTools Paperwork ajuda pequenas empresas a criar documentos confiáveis rapidamente.",
      description:
        "Ferramentas de documentos rápidas e específicas para freelancers, prestadores de serviços e pequenas empresas.",
      eyebrow: "Sobre",
      heading: "Paperwork sem a complexidade de uma suíte contábil",
      focusTitle: "Feito para uma tarefa de cada vez",
      focusBody:
        "O Paperwork oferece geradores específicos de faturas, recibos, relatórios de despesas, registros de quilometragem, estimativas de impostos, solicitações W-9 e acompanhamento de formulários 1099. Cada ferramenta mantém sua ação principal e seu resultado visíveis sem exigir uma configuração contábil complexa.",
      prioritiesTitle: "Nossas prioridades",
      prioritiesBody:
        "Validação clara, prévias precisas, exportações confiáveis, controles acessíveis e explicações simples sobre onde seus dados são armazenados.",
      back: "Voltar às ferramentas do Paperwork",
    },
    Terms: {
      metadataTitle: "Termos do Paperwork",
      metadataDescription: "Consulte os termos de uso e as limitações atuais do SmartTools Paperwork.",
      description:
        "Use o Paperwork como auxílio na preparação de documentos e verifique resultados importantes antes de enviá-los ou protocolá-los.",
      eyebrow: "Termos",
      heading: "Termos práticos para usar o Paperwork",
      controlTitle: "Você controla o documento final",
      controlBody:
        "Confira nomes, datas, totais, configurações de impostos, detalhes de pagamento e arquivos exportados antes de compartilhá-los. Você é responsável pelas informações inseridas e pelos documentos emitidos.",
      adviceTitle: "Não é aconselhamento profissional",
      adviceBody:
        "O Paperwork não oferece aconselhamento jurídico, contábil, de folha de pagamento ou tributário. Consulte um profissional qualificado sobre obrigações específicas da sua empresa ou localidade.",
      availabilityTitle: "Disponibilidade",
      availabilityBody:
        "Os recursos podem mudar conforme as ferramentas melhoram. Guarde suas próprias cópias dos documentos e registros importantes para sua empresa.",
    },
  },
  ar: {
    Contact: {
      metadataTitle: "تواصل مع SmartTools",
      metadataDescription: "أرسل الأسئلة أو ملاحظات المنتج أو بلاغات الأخطاء إلى دعم SmartTools.",
      eyebrow: "تواصل معنا",
      heading: "يسعدنا أن نسمع منك.",
      description: "لديك سؤال أو ملاحظة أو خطأ تريد الإبلاغ عنه؟ أرسل رسالة وسنرد خلال يوم عمل واحد.",
      emailTitle: "راسلنا عبر البريد الإلكتروني",
      emailUnavailable: "لم يُعدّ بريد الدعم",
      helpTitle: "مركز المساعدة",
      helpDescription: "تصفح الأدلة والأسئلة الشائعة",
      responseTitle: "وقت الاستجابة",
      responseDescription: "خلال يوم عمل واحد",
      unavailableError: "لم تُعدّ خدمة التواصل بعد. يُرجى استخدام موارد المساعدة.",
      incompleteError: "أكمل جميع الحقول قبل إرسال رسالتك.",
      successTitle: "الرسالة جاهزة",
      successDescription:
        "من المفترض أن يفتح تطبيق البريد لديك والرسالة مكتملة. أرسلها من هناك وسنرد خلال يوم عمل واحد.",
      writeAnother: "كتابة رسالة أخرى",
      unavailableTitle: "لم تُعدّ خدمة التواصل بعد",
      unavailableDescription: "لم يُعدّ بريد دعم لهذا النشر. يمكنك الاستمرار في استخدام جميع الأدوات دون حساب.",
      nameLabel: "الاسم",
      emailLabel: "البريد الإلكتروني",
      subjectLabel: "الموضوع",
      subjectPlaceholder: "كيف يمكننا مساعدتك؟",
      messageLabel: "الرسالة",
      messagePlaceholder: "أخبرنا قليلًا عما تحتاج إليه…",
      sending: "جارٍ الإرسال…",
      send: "إرسال الرسالة",
      requiredField: "يُرجى إكمال هذا الحقل.",
      invalidEmail: "أدخل عنوان بريد إلكتروني صالحًا.",
    },
    Privacy: {
      metadataTitle: "سياسة الخصوصية | SmartTools",
      metadataDescription:
        "كيف يتعامل SmartTools مع المستندات ومعلومات الحساب وملفات تعريف الارتباط وخيارات التحكم في بياناتك.",
      updated: "معلومات قانونية · آخر تحديث سبتمبر 2026",
      heading: "سياسة الخصوصية",
      description: "ملخص بلغة بسيطة لكيفية تعامل SmartTools مع معلوماتك في Paperwork وDevTools وMedia وميزات الحساب.",
      informationTitle: "المعلومات التي نجمعها",
      informationBody:
        "يُعالج المحتوى الذي تستخدم فيه أدوات SmartTools العامة داخل متصفحك، ما لم توضح الأداة خلاف ذلك صراحةً. إذا أنشأت حسابًا، نخزن اسمك وبريدك الإلكتروني لتوفير ميزات الحساب ومزامنة السجل المدعوم.",
      limitsTitle: "ما لا نفعله",
      limitsBody:
        "لا نبيع بياناتك، ولا نستخدم أدوات تتبع إعلانية تابعة لجهات خارجية، ولا نطلب معلومات أكثر مما نحتاج إليه لتشغيل SmartTools.",
      cookiesTitle: "ملفات تعريف الارتباط",
      cookiesBody:
        "نستخدم عددًا قليلًا من ملفات تعريف الارتباط الضرورية للجلسات والأمان والتفضيلات. وبإذنك، نستخدم أيضًا ملفات تعريف ارتباط اختيارية للتحليلات. لا نستخدم ملفات تعريف ارتباط إعلانية.",
      rightsTitle: "حقوقك",
      rightsBody: "يمكنك تصدير حسابك والبيانات المرتبطة به أو حذفهما في أي وقت من إعدادات ملفك الشخصي.",
    },
    About: {
      metadataTitle: "نبذة عن Paperwork",
      metadataDescription: "تعرّف على كيفية مساعدة SmartTools Paperwork للشركات الصغيرة في إنشاء مستندات موثوقة بسرعة.",
      description: "أدوات مستندات سريعة ومحددة المهام للمستقلين والمتعاقدين والشركات الصغيرة.",
      eyebrow: "نبذة عنا",
      heading: "Paperwork دون تعقيدات حزم المحاسبة",
      focusTitle: "مصمم لمهمة واحدة في كل مرة",
      focusBody:
        "يوفر Paperwork أدوات متخصصة لإنشاء الفواتير والإيصالات وتقارير المصروفات وسجلات المسافات وتقديرات الضرائب وطلبات W-9 وتتبع نماذج 1099. تُبقي كل أداة الإجراء الرئيسي والنتيجة ظاهرين دون الحاجة إلى إعداد محاسبي معقد.",
      prioritiesTitle: "ما نركز على تحسينه",
      prioritiesBody: "تحقق واضح، ومعاينات دقيقة، وتصدير موثوق، وعناصر تحكم ميسّرة، وشرح مبسط لمكان تخزين بياناتك.",
      back: "العودة إلى أدوات Paperwork",
    },
    Terms: {
      metadataTitle: "شروط Paperwork",
      metadataDescription: "راجع شروط الاستخدام والقيود الحالية لخدمة SmartTools Paperwork.",
      description: "استخدم Paperwork مساعدًا لإعداد المستندات وتحقق من النتائج المهمة قبل إرسالها أو تقديمها رسميًا.",
      eyebrow: "الشروط",
      heading: "شروط عملية لاستخدام Paperwork",
      controlTitle: "أنت تتحكم في المستند النهائي",
      controlBody:
        "راجع الأسماء والتواريخ والمجاميع وإعدادات الضرائب وتفاصيل الدفع والملفات المصدّرة قبل مشاركتها. أنت مسؤول عن المعلومات التي تدخلها والمستندات التي تصدرها.",
      adviceTitle: "ليس استشارة مهنية",
      adviceBody:
        "لا يقدم Paperwork استشارات قانونية أو محاسبية أو متعلقة بالرواتب أو الضرائب. استشر مختصًا مؤهلًا بشأن الالتزامات الخاصة بنشاطك أو موقعك.",
      availabilityTitle: "التوفر",
      availabilityBody:
        "قد تتغير الميزات مع تحسن مجموعة الأدوات. احتفظ بنسخك الخاصة من المستندات والسجلات المهمة لنشاطك.",
    },
  },
  "zh-Hans": {
    Contact: {
      metadataTitle: "联系 SmartTools",
      metadataDescription: "向 SmartTools 支持团队发送问题、产品反馈或错误报告。",
      eyebrow: "联系我们",
      heading: "我们期待听到您的意见。",
      description: "有问题、建议或需要报告错误？请给我们留言，我们将在一个工作日内回复。",
      emailTitle: "发送电子邮件",
      emailUnavailable: "尚未配置支持邮箱",
      helpTitle: "帮助中心",
      helpDescription: "浏览指南和常见问题",
      responseTitle: "回复时间",
      responseDescription: "1 个工作日内",
      unavailableError: "联系功能尚未设置。请使用帮助资源。",
      incompleteError: "请填写所有字段后再发送消息。",
      successTitle: "消息已准备好",
      successDescription: "您的邮件应用应已打开，并填好了消息。请在邮件应用中发送，我们将在一个工作日内回复。",
      writeAnother: "再写一条消息",
      unavailableTitle: "联系功能尚未设置",
      unavailableDescription: "此部署尚未配置支持邮箱。您仍可在没有账户的情况下使用所有工具。",
      nameLabel: "姓名",
      emailLabel: "电子邮箱",
      subjectLabel: "主题",
      subjectPlaceholder: "我们能如何帮助您？",
      messageLabel: "消息",
      messagePlaceholder: "请简单描述您的需求…",
      sending: "正在发送…",
      send: "发送消息",
      requiredField: "请填写此字段。",
      invalidEmail: "请输入有效的电子邮箱地址。",
    },
    Privacy: {
      metadataTitle: "隐私政策 | SmartTools",
      metadataDescription: "了解 SmartTools 如何处理文档、账户信息、Cookie 及您的数据控制选项。",
      updated: "法律信息 · 更新于 2026 年 9 月",
      heading: "隐私政策",
      description: "用通俗语言介绍 SmartTools 如何在 Paperwork、DevTools、Media 和账户功能中处理您的信息。",
      informationTitle: "我们收集的信息",
      informationBody:
        "除非工具明确说明，否则您通过 SmartTools 公共工具处理的内容均在浏览器中处理。如果您创建账户，我们会存储您的姓名和电子邮箱，以提供账户功能并同步受支持的历史记录。",
      limitsTitle: "我们不会做的事",
      limitsBody: "我们不会出售您的数据、使用第三方广告跟踪器，也不会索取超出运营 SmartTools 所需的信息。",
      cookiesTitle: "Cookie",
      cookiesBody:
        "我们使用少量必要的 Cookie 来维持会话、安全和偏好设置。经您许可，我们也会使用可选的分析 Cookie。我们不使用广告 Cookie。",
      rightsTitle: "您的权利",
      rightsBody: "您可以随时在个人资料设置中导出或删除账户及其相关数据。",
    },
    About: {
      metadataTitle: "关于 Paperwork",
      metadataDescription: "了解 SmartTools Paperwork 如何帮助小型企业快速创建可靠的文档。",
      description: "为自由职业者、承包商和小型企业提供快速、专注的文档工具。",
      eyebrow: "关于",
      heading: "Paperwork，让文档工作无需复杂的会计套件",
      focusTitle: "一次专注于一项任务",
      focusBody:
        "Paperwork 提供专门的生成工具，用于发票、收据、费用报告、里程记录、税费估算、W-9 请求和 1099 跟踪。每个工具都让主要操作和输出清晰可见，无需复杂的会计设置。",
      prioritiesTitle: "我们的优化重点",
      prioritiesBody: "清晰的验证、准确的预览、可靠的导出、无障碍控件，以及对数据存储位置的通俗说明。",
      back: "返回 Paperwork 工具",
    },
    Terms: {
      metadataTitle: "Paperwork 使用条款",
      metadataDescription: "查看 SmartTools Paperwork 当前的使用条款和限制。",
      description: "请将 Paperwork 用作文档准备的辅助工具，并在发送或提交重要结果之前进行核实。",
      eyebrow: "条款",
      heading: "Paperwork 实用使用条款",
      controlTitle: "最终文档由您负责",
      controlBody:
        "分享之前，请核对姓名、日期、总额、税务设置、付款详情和导出的文件。您需对输入的信息和出具的文档负责。",
      adviceTitle: "不构成专业建议",
      adviceBody: "Paperwork 不提供法律、会计、薪资或税务建议。有关您的企业或所在地的具体义务，请咨询合格的专业人士。",
      availabilityTitle: "可用性",
      availabilityBody: "随着工具集不断改进，功能可能会变化。请自行保存对业务重要的文档和记录副本。",
    },
  },
  ja: {
    Contact: {
      metadataTitle: "SmartTools へのお問い合わせ",
      metadataDescription: "ご質問、製品へのご意見、不具合の報告を SmartTools サポートにお送りください。",
      eyebrow: "お問い合わせ",
      heading: "ご意見をお聞かせください。",
      description:
        "ご質問、ご意見、不具合のご報告はありませんか？メッセージをお送りいただければ、1 営業日以内に返信します。",
      emailTitle: "メールでお問い合わせ",
      emailUnavailable: "サポート用メールアドレスが未設定です",
      helpTitle: "ヘルプセンター",
      helpDescription: "ガイドとよくある質問を見る",
      responseTitle: "返信までの時間",
      responseDescription: "1 営業日以内",
      unavailableError: "お問い合わせ機能はまだ設定されていません。ヘルプをご利用ください。",
      incompleteError: "送信する前に、すべての項目を入力してください。",
      successTitle: "メッセージの準備ができました",
      successDescription:
        "メッセージが入力された状態でメールアプリが開きます。そちらから送信してください。1 営業日以内に返信します。",
      writeAnother: "別のメッセージを書く",
      unavailableTitle: "お問い合わせ機能はまだ設定されていません",
      unavailableDescription:
        "この環境にはサポート用メールアドレスが設定されていません。引き続きアカウントなしですべてのツールを利用できます。",
      nameLabel: "お名前",
      emailLabel: "メールアドレス",
      subjectLabel: "件名",
      subjectPlaceholder: "どのようなご用件ですか？",
      messageLabel: "メッセージ",
      messagePlaceholder: "ご要望を簡単にお聞かせください…",
      sending: "送信中…",
      send: "メッセージを送信",
      requiredField: "この項目を入力してください。",
      invalidEmail: "有効なメールアドレスを入力してください。",
    },
    Privacy: {
      metadataTitle: "プライバシーポリシー | SmartTools",
      metadataDescription: "SmartTools による文書、アカウント情報、Cookie、データ管理機能の取り扱いについて。",
      updated: "法的情報 · 2026 年 9 月更新",
      heading: "プライバシーポリシー",
      description:
        "Paperwork、DevTools、Media、アカウント機能で SmartTools が情報をどのように扱うかを、わかりやすくまとめています。",
      informationTitle: "収集する情報",
      informationBody:
        "SmartTools の公開ツールで処理するコンテンツは、ツールが明示しない限り、ブラウザー内で処理されます。アカウントを作成した場合は、アカウント機能の提供と対応する履歴の同期のため、お名前とメールアドレスを保存します。",
      limitsTitle: "行わないこと",
      limitsBody:
        "データの販売、第三者の広告トラッカーの使用、SmartTools の運営に必要な範囲を超える情報の収集は行いません。",
      cookiesTitle: "Cookie",
      cookiesBody:
        "セッション、セキュリティ、設定のために少数の必須 Cookie を使用します。許可をいただいた場合は、任意の分析用 Cookie も使用します。広告用 Cookie は使用しません。",
      rightsTitle: "お客様の権利",
      rightsBody: "プロフィール設定から、いつでもアカウントと関連データをエクスポートまたは削除できます。",
    },
    About: {
      metadataTitle: "Paperwork について",
      metadataDescription:
        "SmartTools Paperwork が小規模事業者による信頼できる文書の迅速な作成をどのように支援するかをご紹介します。",
      description: "フリーランス、請負業者、小規模事業者向けの、すばやく使える用途別の文書ツール。",
      eyebrow: "概要",
      heading: "複雑な会計ソフトを使わずに Paperwork で文書作成",
      focusTitle: "一度に一つの仕事に集中できる設計",
      focusBody:
        "Paperwork は、請求書、領収書、経費報告書、走行距離記録、税額見積もり、W-9 の依頼、1099 の管理に特化した作成ツールを提供します。複雑な会計設定を必要とせず、各ツールの主な操作と出力が常に見えるようになっています。",
      prioritiesTitle: "重視していること",
      prioritiesBody:
        "明確な入力チェック、正確なプレビュー、信頼できるエクスポート、使いやすくアクセシブルな操作部、データの保存場所に関するわかりやすい説明。",
      back: "Paperwork ツールに戻る",
    },
    Terms: {
      metadataTitle: "Paperwork 利用規約",
      metadataDescription: "SmartTools Paperwork の現在の利用条件と制限をご確認ください。",
      description: "Paperwork は文書作成の補助として使用し、重要な出力は送信や提出の前に確認してください。",
      eyebrow: "利用規約",
      heading: "Paperwork を利用する際の基本条件",
      controlTitle: "最終文書の管理はお客様の責任です",
      controlBody:
        "共有する前に、氏名、日付、合計、税設定、支払情報、エクスポートしたファイルを確認してください。入力した情報と発行した文書については、お客様が責任を負います。",
      adviceTitle: "専門的な助言ではありません",
      adviceBody:
        "Paperwork は、法律、会計、給与計算、税務に関する助言を提供しません。事業や所在地に固有の義務については、資格を持つ専門家に相談してください。",
      availabilityTitle: "提供状況",
      availabilityBody:
        "ツールの改善に伴い、機能が変更されることがあります。事業にとって重要な文書や記録は、ご自身でコピーを保管してください。",
    },
  },
  ru: {
    Contact: {
      metadataTitle: "Связаться со SmartTools",
      metadataDescription: "Отправляйте вопросы, отзывы о продукте или сообщения об ошибках в поддержку SmartTools.",
      eyebrow: "Контакты",
      heading: "Будем рады вашему сообщению.",
      description:
        "Есть вопрос, отзыв или ошибка, о которой нужно сообщить? Напишите нам, и мы ответим в течение одного рабочего дня.",
      emailTitle: "Написать по почте",
      emailUnavailable: "Почта поддержки не настроена",
      helpTitle: "Справочный центр",
      helpDescription: "Руководства и частые вопросы",
      responseTitle: "Время ответа",
      responseDescription: "В течение 1 рабочего дня",
      unavailableError: "Связь с поддержкой ещё не настроена. Воспользуйтесь справочными материалами.",
      incompleteError: "Заполните все поля перед отправкой сообщения.",
      successTitle: "Сообщение готово",
      successDescription:
        "Должно открыться ваше почтовое приложение с заполненным сообщением. Отправьте его оттуда, и мы ответим в течение одного рабочего дня.",
      writeAnother: "Написать ещё одно сообщение",
      unavailableTitle: "Связь с поддержкой ещё не настроена",
      unavailableDescription:
        "Для этой установки не задан адрес поддержки. Вы можете продолжать пользоваться всеми инструментами без учётной записи.",
      nameLabel: "Имя",
      emailLabel: "Электронная почта",
      subjectLabel: "Тема",
      subjectPlaceholder: "Чем мы можем помочь?",
      messageLabel: "Сообщение",
      messagePlaceholder: "Расскажите немного о том, что вам нужно…",
      sending: "Отправка…",
      send: "Отправить сообщение",
      requiredField: "Заполните это поле.",
      invalidEmail: "Введите корректный адрес электронной почты.",
    },
    Privacy: {
      metadataTitle: "Политика конфиденциальности | SmartTools",
      metadataDescription:
        "Как SmartTools обрабатывает документы, данные учётной записи, файлы cookie и настройки управления вашими данными.",
      updated: "Правовая информация · Обновлено в сентябре 2026 г.",
      heading: "Политика конфиденциальности",
      description:
        "Краткое и понятное описание того, как SmartTools обрабатывает ваши данные в Paperwork, DevTools, Media и функциях учётной записи.",
      informationTitle: "Какие данные мы собираем",
      informationBody:
        "Содержимое, которое вы обрабатываете с помощью общедоступных инструментов SmartTools, обрабатывается в браузере, если инструмент явно не указывает иное. При создании учётной записи мы сохраняем ваше имя и электронную почту для предоставления её функций и синхронизации поддерживаемой истории.",
      limitsTitle: "Чего мы не делаем",
      limitsBody:
        "Мы не продаём ваши данные, не используем сторонние рекламные трекеры и не запрашиваем больше информации, чем необходимо для работы SmartTools.",
      cookiesTitle: "Файлы cookie",
      cookiesBody:
        "Мы используем небольшое количество необходимых файлов cookie для сеансов, безопасности и настроек. С вашего разрешения мы также используем необязательные аналитические файлы cookie. Рекламные файлы cookie не используются.",
      rightsTitle: "Ваши права",
      rightsBody:
        "Вы можете в любой момент экспортировать или удалить учётную запись и связанные с ней данные в настройках профиля.",
    },
    About: {
      metadataTitle: "О Paperwork",
      metadataDescription:
        "Узнайте, как SmartTools Paperwork помогает малому бизнесу быстро создавать надёжные документы.",
      description:
        "Быстрые специализированные инструменты для документов для фрилансеров, подрядчиков и малого бизнеса.",
      eyebrow: "О сервисе",
      heading: "Paperwork без сложностей бухгалтерского пакета",
      focusTitle: "Для одной задачи за раз",
      focusBody:
        "Paperwork предлагает специализированные генераторы счетов, квитанций, отчётов о расходах, журналов пробега, налоговых расчётов, запросов W-9 и учёта форм 1099. В каждом инструменте основное действие и результат остаются на виду, а сложная настройка бухгалтерии не требуется.",
      prioritiesTitle: "Наши приоритеты",
      prioritiesBody:
        "Понятная проверка данных, точный предпросмотр, надёжный экспорт, доступные элементы управления и простое объяснение места хранения ваших данных.",
      back: "Назад к инструментам Paperwork",
    },
    Terms: {
      metadataTitle: "Условия Paperwork",
      metadataDescription: "Ознакомьтесь с действующими условиями использования и ограничениями SmartTools Paperwork.",
      description:
        "Используйте Paperwork как помощник для подготовки документов и проверяйте важные результаты перед отправкой или подачей.",
      eyebrow: "Условия",
      heading: "Практические условия использования Paperwork",
      controlTitle: "Итоговый документ под вашим контролем",
      controlBody:
        "Перед передачей проверяйте имена, даты, суммы, налоговые настройки, платёжные реквизиты и экспортированные файлы. Вы отвечаете за введённые данные и выпущенные документы.",
      adviceTitle: "Не профессиональная консультация",
      adviceBody:
        "Paperwork не предоставляет юридических, бухгалтерских, зарплатных или налоговых консультаций. По обязательствам, связанным с вашим бизнесом или местоположением, обращайтесь к квалифицированному специалисту.",
      availabilityTitle: "Доступность",
      availabilityBody:
        "Функции могут меняться по мере улучшения инструментов. Храните собственные копии документов и записей, важных для вашего бизнеса.",
    },
  },
};

export function getInfoMessages(locale: Locale): InfoMessages {
  return messages[locale];
}
