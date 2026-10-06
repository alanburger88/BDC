/* "Support for you" module content (namespace: support).
 * Helpful, optional resources - never an offer embedded in the amendment.
 * Product names and destinations follow BDC's public English and French
 * pages (PRD sections 14 and 20). No rate, maximum amount, eligibility,
 * pre-approval or promised outcome is stated anywhere. Dates are passed in
 * as parameters formatted with App.fmt from the issued record.
 * French drafts are implementation input pending qualified fr-CA review. */
App.i18n.register('support', {
  'en-CA': {
    overline: 'Optional support',
    title: 'Support for you',
    intro: 'Optional BDC resources related to the seasonal inventory plan stated in your file. They are not part of your notice or amendment, and seeing them here does not imply eligibility, pre-approval or any particular outcome.',
    basis: {
      label: 'Based on your file:',
      seasonal: 'planned seasonal inventory build',
      general: 'No specific business plan is stated in your file, so these are general resources.',
      never: 'Survey answers, your name, your language and your browsing are never used to choose suggestions.',
    },
    listLabel: 'Suggested resources',
    categories: {
      advice: 'Advisory service',
      financing: 'Financing',
      learning: 'Learning',
      help: 'Help first',
    },
    whyTitle: 'Why this may be relevant',
    learnMore: 'Learn more on bdc.ca',
    externalAria: '{action}: {title} (opens an external BDC website in a new tab)',
    inquiryAria: '{action}: {title}. Prepares a local demo question; nothing is sent to BDC.',
    cards: {
      'financial-management': {
        title: 'Financial management consulting',
        summary: 'BDC’s public information describes financial management consulting that includes cash-flow and working-capital management. It is an advisory service, separate from your loan and from this notice.',
        why: {
          seasonal: 'Your file states a planned seasonal inventory build. With principal payments resuming on {resume}, forecasting cash flow and planning working capital around that build may be useful.',
          general: 'Forecasting cash flow and planning working capital may be useful as principal payments resume on {resume}.',
        },
        action: 'Discuss cash-flow planning',
        url: 'https://www.bdc.ca/en/consulting/financial-management',
      },
      'working-capital': {
        title: 'Working Capital Loan',
        summary: 'BDC’s public information describes a Working Capital Loan for operating needs such as inventory. It would be a separate product, not a change to the financing described in this notice.',
        statement: 'Explore whether this fits your business. Subject to assessment and approval.',
        why: {
          seasonal: 'Funding for inventory and the operating cycle may merit a separate discussion, after you have reviewed your existing financing.',
          general: 'Operating-cycle funding may merit a separate discussion, after you have reviewed your existing financing.',
        },
        action: 'Explore financing options',
        url: 'https://www.bdc.ca/en/financing/working-capital-loan',
      },
      learning: {
        title: 'BDC cash-flow learning resources',
        summary: 'Start with the BDC article “Managing cash flow in a seasonal business,” part of BDC’s public articles and tools for entrepreneurs.',
        tag: 'Educational, not a lending product',
        why: {
          seasonal: 'Learning more about seasonal cash flow can help you plan around your inventory build, with no credit commitment.',
          general: 'Learning more about cash flow can help you plan ahead, with no credit commitment.',
        },
        action: 'Explore resources',
        url: 'https://www.bdc.ca/en/articles-tools/money-finance/manage-finances/seasonal-business-cash-flow',
      },
      help: {
        title: 'Talk to us about your situation',
        summary: 'If making your payments or planning cash flow is difficult right now, start with a conversation. You can prepare a question, or find answers in Help & questions.',
        whyTitle: 'Why this comes first',
        why: 'In this demonstration, when a hardship or arrears flag is set, help comes before any suggestion of new borrowing.',
        note: 'In this demonstration, a question you prepare stays in your browser. Nothing is sent to BDC.',
        ask: 'Ask a question',
        askAria: 'Ask a question about your situation. Prepares a local demo question; nothing is sent to BDC.',
        helpLink: 'Go to Help & questions',
      },
    },
    hide: 'Hide this suggestion',
    hideAria: 'Hide this suggestion: {title}',
    hiddenAnnounce: 'Suggestion hidden for this session.',
    showHidden: 'Show hidden suggestions ({n})',
    restoredAnnounce: 'Hidden suggestions are shown again.',
    allHidden: {
      title: 'All suggestions are hidden',
      text: 'You chose to hide every suggestion for this session. Your notice and its information are not affected.',
    },
    rule: {
      title: 'Borrowing suggestions are hidden',
      text: 'A hardship or arrears flag is set for this demonstration, so a responsible demo rule hides additional-borrowing suggestions and puts help first. This is a rule of this demonstration, not a BDC policy.',
    },
    footer: {
      links: 'Links open BDC’s public website in a new tab, only when you select them.',
      data: 'This demonstration does not share any data with BDC, and questions you prepare here stay in this browser.',
      source: 'Descriptions summarize BDC’s public information for this concept demonstration. They are not offers.',
    },
  },
  'fr-CA': {
    overline: 'Soutien facultatif',
    title: 'Du soutien pour vous',
    intro: 'Ressources facultatives de BDC liées au plan de constitution de stocks saisonnière indiqué dans votre dossier. Elles ne font partie ni de votre avis ni de la modification, et leur présence ici n’implique aucune admissibilité, aucune préapprobation ni aucun résultat particulier.',
    basis: {
      label: 'Selon votre dossier :',
      seasonal: 'constitution de stocks saisonnière prévue',
      general: 'Aucun plan d’affaires précis n’est indiqué dans votre dossier; il s’agit donc de ressources générales.',
      never: 'Vos réponses au sondage, votre nom, votre langue et votre navigation ne servent jamais à choisir les suggestions.',
    },
    listLabel: 'Ressources suggérées',
    categories: {
      advice: 'Service-conseil',
      financing: 'Financement',
      learning: 'Apprentissage',
      help: 'L’aide d’abord',
    },
    whyTitle: 'Pourquoi cela pourrait être pertinent',
    learnMore: 'En savoir plus sur bdc.ca',
    externalAria: '{action} : {title} (ouvre un site Web externe de BDC dans un nouvel onglet)',
    inquiryAria: '{action} : {title}. Prépare une question de démonstration locale; rien n’est transmis à BDC.',
    cards: {
      'financial-management': {
        title: 'Consultation en gestion financière',
        summary: 'L’information publique de BDC décrit un service de consultation en gestion financière qui comprend la gestion de la trésorerie et du fonds de roulement. Il s’agit d’un service-conseil, distinct de votre prêt et du présent avis.',
        why: {
          seasonal: 'Votre dossier indique qu’une constitution de stocks saisonnière est prévue. Comme les remboursements de capital reprennent le {resume}, il pourrait être utile d’établir des prévisions de trésorerie et de planifier votre fonds de roulement en tenant compte de ces stocks.',
          general: 'Il pourrait être utile d’établir des prévisions de trésorerie et de planifier votre fonds de roulement, puisque les remboursements de capital reprennent le {resume}.',
        },
        action: 'Discuter de votre planification de trésorerie',
        url: 'https://www.bdc.ca/fr/consultation/gestion-financiere',
      },
      'working-capital': {
        title: 'Prêt de fonds de roulement',
        summary: 'L’information publique de BDC décrit un Prêt de fonds de roulement destiné aux besoins d’exploitation, comme les stocks. Il s’agirait d’un produit distinct, et non d’une modification du financement décrit dans cet avis.',
        statement: 'Voyez si cette solution convient à votre entreprise. Sous réserve d’évaluation et d’approbation.',
        why: {
          seasonal: 'Le financement des stocks et du cycle d’exploitation pourrait mériter une discussion distincte, une fois votre financement actuel examiné.',
          general: 'Le financement du cycle d’exploitation pourrait mériter une discussion distincte, une fois votre financement actuel examiné.',
        },
        action: 'Explorer les options de financement',
        url: 'https://www.bdc.ca/fr/financement/pret-fonds-roulement',
      },
      learning: {
        title: 'Ressources d’apprentissage de BDC sur la trésorerie',
        summary: 'Commencez par l’article de BDC « Entreprise saisonnière : comment gérer les flux de trésorerie », qui fait partie des articles et outils publics que BDC propose aux entrepreneurs.',
        tag: 'Contenu éducatif, et non un produit de prêt',
        why: {
          seasonal: 'En apprendre davantage sur la gestion de la trésorerie d’une entreprise saisonnière peut vous aider à planifier en fonction de vos stocks, sans aucun engagement de crédit.',
          general: 'En apprendre davantage sur la gestion de la trésorerie peut vous aider à planifier, sans aucun engagement de crédit.',
        },
        action: 'Explorer les ressources',
        url: 'https://www.bdc.ca/fr/articles-outils/argent-finance/gerer-finances/entreprise-saisonniere-flux-tresorerie',
      },
      help: {
        title: 'Parlez-nous de votre situation',
        summary: 'S’il vous est difficile en ce moment d’effectuer vos versements ou de planifier votre trésorerie, commencez par en parler. Vous pouvez préparer une question ou trouver des réponses dans Aide et questions.',
        whyTitle: 'Pourquoi l’aide passe en premier',
        why: 'Dans cette démonstration, lorsqu’un indicateur de difficulté financière ou d’arriérés est activé, l’aide passe avant toute suggestion de nouvel emprunt.',
        note: 'Dans cette démonstration, une question que vous préparez reste dans votre navigateur. Rien n’est transmis à BDC.',
        ask: 'Poser une question',
        askAria: 'Poser une question au sujet de votre situation. Prépare une question de démonstration locale; rien n’est transmis à BDC.',
        helpLink: 'Aller à Aide et questions',
      },
    },
    hide: 'Masquer cette suggestion',
    hideAria: 'Masquer cette suggestion : {title}',
    hiddenAnnounce: 'Suggestion masquée pour cette session.',
    showHidden: 'Afficher les suggestions masquées ({n})',
    restoredAnnounce: 'Les suggestions masquées sont de nouveau affichées.',
    allHidden: {
      title: 'Toutes les suggestions sont masquées',
      text: 'Vous avez choisi de masquer toutes les suggestions pour cette session. Votre avis et ses renseignements ne sont pas touchés.',
    },
    rule: {
      title: 'Les suggestions d’emprunt sont masquées',
      text: 'Un indicateur de difficulté financière ou d’arriérés est activé pour cette démonstration; une règle de démonstration responsable masque donc les suggestions d’emprunt supplémentaire et met l’aide en priorité. Il s’agit d’une règle de cette démonstration, et non d’une politique de BDC.',
    },
    footer: {
      links: 'Les liens ouvrent le site Web public de BDC dans un nouvel onglet, seulement si vous les sélectionnez.',
      data: 'Cette démonstration ne transmet aucune donnée à BDC, et les questions que vous préparez ici restent dans ce navigateur.',
      source: 'Les descriptions résument l’information publique de BDC pour cette démonstration conceptuelle. Elles ne constituent pas des offres.',
    },
  },
});
