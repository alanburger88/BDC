/* Help & questions (namespace "help"): FAQ, glossary page copy, local
 * inquiry card and the three-face snap survey.
 * Every amount and date is a {param} filled from App.record via App.fmt.
 * Answers never describe the postponement as a reduction of debt, and the
 * extra interest within the postponement is always presented as part of the
 * lifetime increase, never added to it.
 * Answer arrays: each entry is a paragraph; entries starting with "- " are
 * rendered as bullet points. [[termId|text]] marks an inline glossary term.
 * French drafts are implementation input pending qualified fr-CA review. */
App.i18n.register('help', {
  'en-CA': {
    overline: 'Questions about your notice',
    title: 'Help & questions',
    intro: 'Find a quick answer, look up a term, prepare a question or tell us how clear this notice was. Everything here refers to the same fictional notice.',
    backToNotice: 'Back to your notice',
    onThisPage: 'On this page',
    seeInNotice: 'See in this notice',
    backToQuestion: 'Back to the question',
    search: {
      label: 'Search questions and terms',
      hint: 'Searches the questions, answers and glossary terms in English.',
      placeholder: 'Type a word',
      clear: 'Clear search',
      cleared: 'Search cleared. All questions and terms are shown.',
      suggestionsLabel: 'Try:',
      suggestions: ['interest', 'maturity', 'fee', 'accountant'],
      count: { one: '{n} result for “{q}”', other: '{n} results for “{q}”' },
      countDetail: '{faq} in the questions, {terms} in the glossary',
      noneTitle: 'No results for “{q}”',
      noneBody: 'Try a shorter or different word, such as “interest” or “payment”. You can also ask Clair, the demo assistant, or prepare a question.',
      noneBodyNoClair: 'Try a shorter or different word, such as “interest” or “payment”. You can also prepare a question about this notice.',
      foundInAnswer: 'Found in the answer',
      // Shown after a language switch: the search text stays as the reader wrote it.
      otherLanguage: 'Search written in {language}. Results include matches in both languages.',
      showingFaq: 'Showing {n} of {total} questions',
      showingTerms: 'Showing {n} of {total} terms',
    },
    faq: {
      title: 'Frequently asked questions',
      intro: 'Plain-language answers that use the figures in your notice. Underlined words open a short definition.',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      noMatches: 'No questions match your search.',
      groups: {
        understanding: 'Understanding the change',
        payments: 'Payments and cost',
        help: 'Getting help',
      },
      links: {
        cost: 'Compare total interest and payments',
        relief: 'See the month-by-month difference',
        schedule: 'See the full revised schedule',
        month: 'See the {month} payment',
        documents: 'Go to your notice',
      },
      items: {
        'why-notice': {
          q: 'Why was this notice issued?',
          a: [
            'You asked for a temporary [[postponement|principal postponement]] to help manage a planned seasonal inventory build. In this fictional scenario, the change is approved and complete. This notice explains how your repayment schedule changes as a result, starting {effectiveDate}.',
            'It shows what changes, what stays the same and what, if anything, you need to do. It is not a new offer, and you do not need to sign anything.',
          ],
        },
        accept: {
          q: 'Must I accept anything?',
          a: [
            'No. In this scenario, the change is already approved and complete, and no acceptance is required through this notice.',
            'We suggest you review the revised schedule and update your [[cashFlow|cash-flow]] planning, especially for the return to a {first} payment on {resume}.',
            '“Mark as reviewed” on the overview is an optional local note in this demo. It is not acceptance, consent or proof of understanding.',
          ],
        },
        'debt-reduced': {
          q: 'Is the debt reduced?',
          a: [
            'No. The {deferred} of principal you would have repaid from {from} to {to} is postponed. It remains owing and is repaid later in the schedule.',
            'After your {from} to {to} payments, your [[outstanding|outstanding principal]] is still {balanceAfter}. The revised schedule has {revCount} payments instead of {origCount} and ends on {revMaturity}.',
            'Over the remaining schedule, total [[interest|interest]] increases by {extra}. Lower payments from {from} to {to} are temporary [[cashFlow|cash-flow]] relief, not a reduction in what you owe.',
          ],
        },
        rate: {
          q: 'Does the rate change?',
          a: [
            'No. The demonstration [[fixedRate|fixed rate]] stays at {rate} a year. Only the timing of principal payments changes.',
            'Total interest increases only because principal is repaid later, so the balance stays higher for longer. The rate itself does not change.',
          ],
        },
        capitalised: {
          q: 'Is unpaid interest added to my balance?',
          a: [
            'No. Interest is paid every month during the postponement, so nothing is added to what you owe. There is no [[capitalisedInterest|capitalised interest]] in this scenario.',
            'Your [[outstanding|outstanding principal]] stays at {principal} from {from} to {to}, then goes down by {monthly} with each payment from {resume}.',
          ],
        },
        'next-payment': {
          q: 'What is my next payment?',
          a: [
            'Your next payment is {next}, due on {nextDate}. It is interest only, because no [[principal|principal]] is due from {from} to {to}.',
            'Under the original schedule, that payment would have been {nextOriginal}. The same {interest} interest-only payment applies at the end of each month from {fromY} to {toY}.',
            'Payments are not processed in this demonstration.',
          ],
        },
        'still-interest': {
          q: 'Do I still pay interest?',
          a: [
            'Yes. Only [[principal|principal]] payments are postponed. [[interest|Interest]] is still charged and paid every month: {interest} with each payment from {fromY} to {toY}.',
            'Because the [[outstanding|outstanding principal]] stays at {principal} during those months, the interest does not go down the way it would have under the original schedule.',
          ],
        },
        relief: {
          q: 'Why is the relief {relief} rather than {deferred}?',
          a: [
            'You postpone {deferred} of [[principal|principal]] payments from {from} to {to} ({period} at {monthly}). Because the principal does not go down during those months, [[interest|interest]] stays at {interest} a month instead of gradually decreasing. That adds {extra3} of interest over those {period}.',
            'So your payments over that period total {revNear} instead of {origNear}: {deferred} minus {extra3} equals {relief} lower.',
            'The {extra3} is already part of the {extra} increase in total interest over the remaining schedule. It is not an extra cost on top of it.',
          ],
        },
        restart: {
          q: 'When do principal payments restart?',
          a: [
            'Principal payments restart on {resume}. That payment is {first}: {monthly} of [[principal|principal]] plus {firstInterest} of [[interest|interest]].',
            'After that, you repay {monthly} of principal each month, plus interest on the [[outstanding|outstanding principal]], until the final payment on {revMaturity}.',
          ],
        },
        'final-payment': {
          q: 'When is my final payment now?',
          a: [
            'Your final payment moves from {origMaturity} to {revMaturity}, {period} later. The [[maturity|maturity date]] changes because the postponed principal is repaid at the end of the schedule.',
            'The revised schedule has {revCount} monthly payments instead of {origCount}. The last one is {finalPayment}.',
          ],
        },
        fee: {
          q: 'Is there a fee?',
          a: [
            'No change fee applies in this scenario: the fee is {fee}.',
            'The cost of the postponement is the additional interest: {extra} over the remaining schedule, already included in the revised schedule.',
          ],
        },
        ask: {
          q: 'How do I ask a question?',
          a: [
            'Use “{askLabel}” on this page, or “{askAbout}” beside a card, payment or notice paragraph. The form keeps the item you selected, so you don’t have to explain the context again.',
            'In this demonstration, the form creates a local demo request only. Nothing is sent to BDC.',
            'For a quick explanation, you can also ask Clair, the demo assistant. Clair answers from this sample notice only, using local rules, with no live AI connection.',
          ],
        },
        accountant: {
          q: 'Can my accountant review it?',
          a: [
            'Yes, you can share what you see here. For example, print the notice or export the revised schedule as a CSV file so your accountant can check it against your records.',
            'This demonstration cannot give anyone access to an account. There is no sign-in, no user management and no connection to BDC systems.',
            'BDC’s published Client Space describes controlled shared access for people you authorise. In a production version, the intended journey would be:',
            '- You would authorise your accountant through BDC’s own secure process for shared access.',
            '- Your accountant would sign in with their own credentials, never yours.',
            '- They would see the notice and schedules you chose to share, and could prepare questions about them.',
            'Never share your own sign-in details, even with your accountant.',
          ],
        },
        'print-export': {
          q: 'Can I print or export the schedule?',
          a: [
            'Yes. In “{noticeTab}”, use “{printLabel}” for a print layout with the notice, its record details and the revised schedule.',
            'In “{paymentsTab}”, you can download the displayed months or the full revised schedule as a CSV file.',
            'A browser-generated PDF is a convenience copy of this demonstration, not a certified record.',
          ],
        },
      },
    },
    glossary: {
      intro: 'Underlined terms throughout the notice open these definitions. Hover over a term, reach it with the keyboard or select it to see its definition, then press Escape to close it.',
      noMatches: 'No glossary terms match your search.',
    },
    ask: {
      overline: 'Still have a question?',
      title: 'Ask a question',
      body: 'Prepare a question about this notice. The form attaches the notice details, and the item you’re asking about when you start from one, so you don’t have to repeat yourself.',
      local: 'Demo only: the form creates a local request in this browser. Nothing is sent to BDC.',
      button: 'Ask a question',
      clair: 'Ask Clair',
      clairNote: 'Clair is the demo assistant. It answers from this sample notice only, with no live AI connection.',
      unavailable: 'The question form is not included in this build of the demonstration.',
    },
    survey: {
      overline: 'Snap survey',
      title: 'Quick feedback',
      question: 'How clear was this notice?',
      intro: 'Choose one answer. You can change it at any time.',
      options: {
        unhappy: 'Not clear',
        neutral: 'Somewhat clear',
        happy: 'Very clear',
      },
      thanks: 'Thank you for your feedback.',
      yourAnswer: 'Your answer: {answer}.',
      recorded: 'Thank you. Answer recorded in this demo: {answer}.',
      updated: 'Answer changed to: {answer}.',
      commentLabel: 'What was unclear? (optional)',
      commentLang: 'Written in {language}',
      commentHint: 'Kept only in this tab’s memory until you reset the demo or close the tab. It is never sent or added to the demo log.',
      offerTitle: 'Would you like help with what was unclear?',
      offerClair: 'Ask Clair',
      offerQuestion: 'Ask a question',
      offerFaq: 'Browse the questions',
      note: 'Local demo response only. Not a Net Promoter Score and not a record of your understanding or consent.',
      hide: 'Hide survey',
      hiddenText: 'The survey is hidden for this session.',
      show: 'Show survey',
      hiddenAnnounce: 'Survey hidden.',
      shownAnnounce: 'Survey shown.',
    },
  },
  'fr-CA': {
    overline: 'Questions sur votre avis',
    title: 'Aide et questions',
    intro: 'Trouvez une réponse rapide, consultez la définition d’un terme, préparez une question ou dites-nous si cet avis était clair. Tout ce qui figure ici porte sur le même avis fictif.',
    backToNotice: 'Retour à votre avis',
    onThisPage: 'Sur cette page',
    seeInNotice: 'Voir dans cet avis',
    backToQuestion: 'Retour à la question',
    search: {
      label: 'Rechercher dans les questions et le glossaire',
      hint: 'La recherche porte sur les questions, les réponses et les termes du glossaire en français.',
      placeholder: 'Saisissez un mot',
      clear: 'Effacer la recherche',
      cleared: 'Recherche effacée. Toutes les questions et tous les termes sont affichés.',
      suggestionsLabel: 'Essayez :',
      suggestions: ['intérêts', 'échéance', 'frais', 'comptable'],
      count: { one: '{n} résultat pour « {q} »', other: '{n} résultats pour « {q} »' },
      countDetail: '{faq} dans les questions, {terms} dans le glossaire',
      noneTitle: 'Aucun résultat pour « {q} »',
      noneBody: 'Essayez un mot plus court ou différent, comme « intérêts » ou « versement ». Vous pouvez aussi vous adresser à Clair, l’assistant de démonstration, ou préparer une question.',
      noneBodyNoClair: 'Essayez un mot plus court ou différent, comme « intérêts » ou « versement ». Vous pouvez aussi préparer une question sur cet avis.',
      foundInAnswer: 'Trouvé dans la réponse',
      otherLanguage: 'Recherche rédigée en {language}. Les résultats tiennent compte des deux langues.',
      showingFaq: 'Questions affichées : {n} sur {total}',
      showingTerms: 'Termes affichés : {n} sur {total}',
    },
    faq: {
      title: 'Questions fréquentes',
      intro: 'Des réponses en langage clair qui reprennent les montants de votre avis. Les mots soulignés ouvrent une courte définition.',
      expandAll: 'Tout ouvrir',
      collapseAll: 'Tout fermer',
      noMatches: 'Aucune question ne correspond à votre recherche.',
      groups: {
        understanding: 'Comprendre la modification',
        payments: 'Versements et coûts',
        help: 'Obtenir de l’aide',
      },
      links: {
        cost: 'Comparer le total des intérêts et des versements',
        relief: 'Voir l’écart mois par mois',
        schedule: 'Voir le calendrier révisé complet',
        month: 'Voir le versement {month}',
        documents: 'Aller à votre avis',
      },
      items: {
        'why-notice': {
          q: 'Pourquoi cet avis a-t-il été émis?',
          a: [
            'Vous avez demandé un [[postponement|report temporaire des remboursements de capital]] afin de gérer une constitution de stocks saisonnière prévue. Dans ce scénario fictif, la modification est approuvée et terminée. Le présent avis explique comment votre calendrier de remboursement change en conséquence, à compter du {effectiveDate}.',
            'Il présente ce qui change, ce qui reste pareil et ce que vous devez faire, s’il y a lieu. Il ne s’agit pas d’une nouvelle offre, et vous n’avez rien à signer.',
          ],
        },
        accept: {
          q: 'Dois-je accepter quelque chose?',
          a: [
            'Non. Dans ce scénario, la modification est déjà approuvée et terminée, et aucune acceptation n’est requise au moyen de cet avis.',
            'Nous vous suggérons de consulter le calendrier révisé et de mettre à jour vos prévisions de [[cashFlow|trésorerie]], surtout en vue du retour à un versement de {first} le {resume}.',
            'La mention « Marquer comme consulté » de l’aperçu est une note locale facultative dans cette démo. Il ne s’agit pas d’une acceptation, d’un consentement ni d’une preuve de compréhension.',
          ],
        },
        'debt-reduced': {
          q: 'Ma dette est-elle réduite?',
          a: [
            'Non. Les {deferred} de capital que vous auriez remboursés de {from} à {to} sont reportés. Ils restent dus et seront remboursés plus tard dans le calendrier.',
            'Après vos versements de {from} à {to}, votre [[outstanding|capital restant à rembourser]] est toujours de {balanceAfter}. Le calendrier révisé compte {revCount} versements au lieu de {origCount} et se termine le {revMaturity}.',
            'Sur la durée restante, le total des [[interest|intérêts]] augmente de {extra}. Les versements réduits de {from} à {to} constituent un allègement temporaire de [[cashFlow|trésorerie]], et non une réduction de ce que vous devez.',
          ],
        },
        rate: {
          q: 'Le taux change-t-il?',
          a: [
            'Non. Le [[fixedRate|taux fixe]] de la démonstration reste de {rate} par année. Seul le moment des remboursements de capital change.',
            'Le total des intérêts augmente uniquement parce que le capital est remboursé plus tard, ce qui maintient le solde plus élevé plus longtemps. Le taux, lui, ne change pas.',
          ],
        },
        capitalised: {
          q: 'Des intérêts impayés sont-ils ajoutés à mon solde?',
          a: [
            'Non. Les intérêts sont payés chaque mois pendant le report; rien n’est donc ajouté à ce que vous devez. Il n’y a pas d’[[capitalisedInterest|intérêts capitalisés]] dans ce scénario.',
            'Votre [[outstanding|capital restant à rembourser]] demeure à {principal} de {from} à {to}, puis diminue de {monthly} à chaque versement à compter du {resume}.',
          ],
        },
        'next-payment': {
          q: 'Quel est mon prochain versement?',
          a: [
            'Votre prochain versement est de {next}, à payer le {nextDate}. Il ne comprend que des intérêts, car aucun remboursement de [[principal|capital]] n’est exigé de {from} à {to}.',
            'Selon le calendrier initial, ce versement aurait été de {nextOriginal}. Le même versement de {interest}, composé uniquement d’intérêts, s’applique à la fin de chaque mois, de {fromY} à {toY}.',
            'Aucun paiement n’est traité dans cette démonstration.',
          ],
        },
        'still-interest': {
          q: 'Dois-je quand même payer des intérêts?',
          a: [
            'Oui. Seuls les remboursements de [[principal|capital]] sont reportés. Les [[interest|intérêts]] continuent d’être calculés et payés chaque mois : {interest} à chaque versement, de {fromY} à {toY}.',
            'Comme le [[outstanding|capital restant à rembourser]] demeure à {principal} pendant ces mois, les intérêts ne diminuent pas comme ils l’auraient fait selon le calendrier initial.',
          ],
        },
        relief: {
          q: 'Pourquoi l’allègement est-il de {relief} plutôt que de {deferred}?',
          a: [
            'Vous reportez {deferred} de remboursements de [[principal|capital]] de {from} à {to} ({period} à {monthly}). Comme le capital ne diminue pas pendant ces mois, les [[interest|intérêts]] restent à {interest} par mois au lieu de diminuer graduellement. Cela ajoute {extra3} d’intérêts sur ces {period}.',
            'Vos versements de cette période totalisent donc {revNear} au lieu de {origNear} : {deferred} moins {extra3}, soit {relief} de moins.',
            'Les {extra3} font déjà partie de la hausse de {extra} du total des intérêts sur la durée restante. Ils ne s’y ajoutent pas.',
          ],
        },
        restart: {
          q: 'Quand les remboursements de capital reprennent-ils?',
          a: [
            'Les remboursements de capital reprennent le {resume}. Ce versement est de {first} : {monthly} de [[principal|capital]] plus {firstInterest} d’[[interest|intérêts]].',
            'Par la suite, vous remboursez {monthly} de capital chaque mois, plus les intérêts sur le [[outstanding|capital restant à rembourser]], jusqu’au dernier versement, le {revMaturity}.',
          ],
        },
        'final-payment': {
          q: 'Quand aura lieu mon dernier versement?',
          a: [
            'Votre dernier versement passe du {origMaturity} au {revMaturity}, soit {period} plus tard. La [[maturity|date d’échéance]] change parce que le capital reporté est remboursé à la fin du calendrier.',
            'Le calendrier révisé compte {revCount} versements mensuels au lieu de {origCount}. Le dernier est de {finalPayment}.',
          ],
        },
        fee: {
          q: 'Y a-t-il des frais?',
          a: [
            'Aucuns frais de modification ne s’appliquent dans ce scénario : les frais sont de {fee}.',
            'Le coût du report correspond aux intérêts additionnels : {extra} sur la durée restante, déjà inclus dans le calendrier révisé.',
          ],
        },
        ask: {
          q: 'Comment poser une question?',
          a: [
            'Utilisez « {askLabel} » sur cette page, ou « {askAbout} » à côté d’une carte, d’un versement ou d’un paragraphe de l’avis. Le formulaire conserve l’élément choisi pour que vous n’ayez pas à réexpliquer le contexte.',
            'Dans cette démonstration, le formulaire crée uniquement une demande de démonstration locale. Rien n’est envoyé à BDC.',
            'Pour une explication rapide, vous pouvez aussi vous adresser à Clair, l’assistant de démonstration. Clair répond uniquement à partir de cet avis type, selon des règles locales, sans connexion à une IA en direct.',
          ],
        },
        accountant: {
          q: 'Puis-je faire examiner l’avis par mon ou ma comptable?',
          a: [
            'Oui, vous pouvez transmettre ce que vous voyez ici. Par exemple, imprimez l’avis ou exportez le calendrier révisé en fichier CSV pour que votre comptable le compare à vos dossiers.',
            'Cette démonstration ne peut donner à personne l’accès à un compte. Il n’y a ni connexion, ni gestion des utilisateurs, ni lien avec les systèmes de BDC.',
            'L’Espace client de BDC, tel qu’il est présenté publiquement, prévoit un accès partagé contrôlé pour les personnes que vous autorisez. Dans une version de production, le parcours prévu serait le suivant :',
            '- Vous autoriseriez votre comptable au moyen du processus sécurisé de BDC pour l’accès partagé.',
            '- Votre comptable se connecterait avec ses propres identifiants, jamais les vôtres.',
            '- Cette personne verrait l’avis et les calendriers que vous choisiriez de partager, et pourrait préparer des questions à leur sujet.',
            'Ne communiquez jamais vos propres identifiants de connexion, même à votre comptable.',
          ],
        },
        'print-export': {
          q: 'Puis-je imprimer ou exporter le calendrier?',
          a: [
            'Oui. Dans « {noticeTab} », utilisez « {printLabel} » pour obtenir une mise en page imprimable comprenant l’avis, les renseignements du dossier et le calendrier révisé.',
            'Dans « {paymentsTab} », vous pouvez télécharger les mois affichés ou le calendrier révisé complet en fichier CSV.',
            'Un PDF produit par le navigateur est une copie pratique de cette démonstration, et non un document certifié.',
          ],
        },
      },
    },
    glossary: {
      intro: 'Les termes soulignés dans l’avis ouvrent ces définitions. Survolez un terme, atteignez-le au clavier ou sélectionnez-le pour afficher sa définition, puis appuyez sur Échap pour la fermer.',
      noMatches: 'Aucun terme du glossaire ne correspond à votre recherche.',
    },
    ask: {
      overline: 'Vous avez encore une question?',
      title: 'Poser une question',
      body: 'Préparez une question sur cet avis. Le formulaire joint les renseignements de l’avis et, s’il y a lieu, l’élément visé, pour que vous n’ayez pas à vous répéter.',
      local: 'Démo seulement : le formulaire crée une demande locale dans ce navigateur. Rien n’est envoyé à BDC.',
      button: 'Poser une question',
      clair: 'Demander à Clair',
      clairNote: 'Clair est l’assistant de démonstration. Ses réponses proviennent uniquement de cet avis type, sans connexion à une IA en direct.',
      unavailable: 'Le formulaire de question n’est pas inclus dans cette version de la démonstration.',
    },
    survey: {
      overline: 'Sondage éclair',
      title: 'Rétroaction rapide',
      question: 'Cet avis était-il clair?',
      intro: 'Choisissez une réponse. Vous pouvez la modifier en tout temps.',
      options: {
        unhappy: 'Pas clair',
        neutral: 'Assez clair',
        happy: 'Très clair',
      },
      thanks: 'Merci de votre rétroaction.',
      yourAnswer: 'Votre réponse : {answer}.',
      recorded: 'Merci. Réponse enregistrée dans cette démo : {answer}.',
      updated: 'Réponse modifiée : {answer}.',
      commentLabel: 'Qu’est-ce qui n’était pas clair? (facultatif)',
      commentLang: 'Rédigé en {language}',
      commentHint: 'Conservé uniquement dans la mémoire de cet onglet jusqu’à ce que vous réinitialisiez la démo ou fermiez l’onglet. Ce texte n’est jamais envoyé ni ajouté au journal de la démo.',
      offerTitle: 'Souhaitez-vous de l’aide pour y voir plus clair?',
      offerClair: 'Demander à Clair',
      offerQuestion: 'Poser une question',
      offerFaq: 'Parcourir les questions',
      note: 'Réponse de démonstration locale seulement. Il ne s’agit pas d’un indice de recommandation net (Net Promoter Score) ni d’une preuve de votre compréhension ou de votre consentement.',
      hide: 'Masquer le sondage',
      hiddenText: 'Le sondage est masqué pour cette session.',
      show: 'Afficher le sondage',
      hiddenAnnounce: 'Sondage masqué.',
      shownAnnounce: 'Sondage affiché.',
    },
  },
});
