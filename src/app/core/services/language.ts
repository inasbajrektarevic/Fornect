import { inject, Injectable, signal } from '@angular/core';

import { AuthService } from './auth';

export type AppLanguage = 'bs' | 'en';

const translations: Record<AppLanguage, Record<string, string>> = {
  bs: {
    'common.backToDashboard': 'Nazad na početnu',
    'common.save': 'Sačuvaj',
    'common.cancel': 'Odustani',
    'common.saved': 'Sačuvano',
    'common.on': 'Uključeno',
    'common.off': 'Isključeno',
    'common.online': 'Online',
    'common.offline': 'Offline',
    'common.logout': 'Odjava',
    'common.notifications': 'Obavijesti',
    'common.settings': 'Postavke',

    'dashboard.title': 'Mrežna zaštita',
    'dashboard.protectionStatus': 'Status zaštite',
    'dashboard.networkProtected': 'Vaša mreža je zaštićena',
    'dashboard.internetPaused': 'Internet je pauziran',
    'dashboard.monitoring':
      'Fornect je aktivan i nadzire vašu mrežu.',
    'dashboard.pausedMessage':
      'Pristup internetu je trenutno pauziran za sve uređaje.',
    'dashboard.devicesOnline': 'Uređaji online',
    'dashboard.protectedDevices': 'Zaštićeni uređaji',
    'dashboard.childProfiles': 'Dječiji profili',
    'dashboard.internetPausedCount': 'Internet pauziran',
    'dashboard.fornectDevice': 'Fornect uređaj',
    'dashboard.mainDevice': 'Glavni uređaj za zaštitu mreže',
    'dashboard.software': 'Softver',
    'dashboard.lastSeen': 'Posljednji put viđen',
    'dashboard.justNow': 'Upravo sada',
    'dashboard.quickActions': 'Brze akcije',
    'dashboard.devices': 'Uređaji',
    'dashboard.pauseInternet': 'Pauziraj internet',
    'dashboard.resumeInternet': 'Nastavi internet',
    'dashboard.schedules': 'Rasporedi',
    'dashboard.protection': 'Zaštita',

    'restrictions.label': 'Sadržaj',
    'restrictions.title': 'Ograničenja sadržaja',
    'restrictions.description':
      'Pravila se automatski postavljaju prema profilu ({profile}), ali ih možete prilagoditi za ovaj uređaj.',
    'restrictions.profileDefaults': 'Postavke profila',
    'restrictions.customized': 'Prilagođeno',
    'restrictions.reset': 'Vrati na postavke profila',
    'restrictions.blockAdultContent':
      'Blokiraj sadržaj za odrasle',
    'restrictions.blockAdultContentHint':
      'Pornografija i drugi sadržaj neprimjeren za maloljetnike.',
    'restrictions.blockSocialMedia':
      'Blokiraj društvene mreže',
    'restrictions.blockSocialMediaHint':
      'Instagram, TikTok, Facebook, X i slične platforme.',
    'restrictions.blockGaming':
      'Blokiraj gaming platforme',
    'restrictions.blockGamingHint':
      'Online igre i servisi za igranje.',
    'restrictions.blockStreaming':
      'Blokiraj streaming servise',
    'restrictions.blockStreamingHint':
      'Netflix, YouTube, Twitch i slični servisi.',
    'restrictions.blockAdsTrackers':
      'Blokiraj reklame i pratioce',
    'restrictions.blockAdsTrackersHint':
      'Reklamne mreže i skripte koje prate ponašanje na internetu.',
    'restrictions.safeSearch':
      'Sigurna pretraga',
    'restrictions.safeSearchHint':
      'Prisilno uključuje Safe Search na Google i Bing pretrazi.',
    'restrictions.youtubeRestricted':
      'YouTube ograničeni način',
    'restrictions.youtubeRestrictedHint':
      'Skriva YouTube sadržaj označen kao neprimjeren za mlađe.',

    'pro.title': 'Pro panel',
    'pro.modeHome': 'Home',
    'pro.modeHospitality': 'Hospitality',
    'pro.modeAgency': 'Agency',
    'pro.backToDashboard': 'Nazad na Pro pregled',
    'pro.capacityLabel': 'Kapacitet mreže',
    'pro.users': 'korisnika',
    'pro.capacityUsed': 'Iskorišteno {percent}% kapaciteta.',
    'pro.nearLimitTitle': 'Blizu ste limita kapaciteta',
    'pro.nearLimitDescription':
      'Kada se limit dostigne, novi korisnici se neće moći povezati. Razmotrite nadogradnju kapaciteta.',
    'pro.upgradeCapacity': 'Nadogradi kapacitet',
    'pro.device': 'Uređaj',
    'pro.software': 'Softver',
    'pro.serialNumber': 'Serijski broj',
    'pro.peakLoad': 'Vršno opterećenje',
    'pro.networkLoad': 'Opterećenje mreže',
    'pro.averageUsers': 'Prosječno {count} korisnika',
    'pro.periodDay': 'Dan',
    'pro.periodWeek': 'Sedmica',
    'pro.periodMonth': 'Mjesec',

    'hospitality.title': 'Zaštita gostiju',
    'hospitality.subtitle':
      'Postavke gostinske mreže i stranice dobrodošlice.',
    'hospitality.guestProtection': 'Gostinska zaštita',
    'hospitality.autoProtectOn': 'Gosti se štite automatski',
    'hospitality.autoProtectOff':
      'Automatska zaštita je isključena',
    'hospitality.autoProtectDescription':
      'Svaki uređaj koji se poveže na mrežu odmah dobija Fornect zaštitu. Osoblje ne mora ništa raditi.',
    'hospitality.turnOn': 'Uključi automatsku zaštitu',
    'hospitality.turnOff': 'Isključi automatsku zaštitu',
    'hospitality.noParentalControl':
      'Roditeljski nadzor i vremenska ograničenja nisu dostupni u ovom modu jer nisu relevantni za goste.',
    'hospitality.connectedNow': 'Trenutno povezano',
    'hospitality.guestsToday': 'Gostiju danas',
    'hospitality.guestsThisWeek': 'Gostiju ove sedmice',
    'hospitality.averageSession': 'Prosječna sesija',
    'hospitality.minutes': '{minutes} min',
    'hospitality.privacyNote':
      'Statistika je zbirna. Pojedinačni gosti se ne identifikuju niti prate.',
    'hospitality.splashLabel': 'Stranica dobrodošlice',
    'hospitality.splashTitle': 'Poruka za goste',
    'hospitality.splashDescription':
      'Ovo gost vidi kada se prvi put poveže na mrežu.',
    'hospitality.brandName': 'Naziv objekta',
    'hospitality.headline': 'Naslov',
    'hospitality.message': 'Poruka',
    'hospitality.splashSaved':
      'Stranica dobrodošlice je sačuvana.',
    'hospitality.preview': 'Pregled',
    'hospitality.connect': 'Poveži se',

    'agency.title': 'Monitoring i izvještaji',
    'agency.subtitle':
      'Pregled saobraćaja, izvještaji, alarmi i evidencija.',
    'agency.monitoringLabel': 'Monitoring',
    'agency.monitoringDescription':
      'Prikazuju se samo metapodaci: broj konekcija i tip saobraćaja. Sadržaj komunikacije se ne čita niti pohranjuje.',
    'agency.totalConnections': 'Ukupno {count} konekcija',
    'agency.connections': 'konekcija',
    'agency.categoryWeb': 'Web saobraćaj',
    'agency.categoryStreaming': 'Streaming',
    'agency.categorySocial': 'Društvene mreže',
    'agency.categoryAds': 'Reklame i pratioci',
    'agency.categoryOther': 'Ostalo',
    'agency.reportsLabel': 'Izvještaji',
    'agency.reportsTitle': 'Generisanje izvještaja',
    'agency.reportsDescription':
      'Izaberite period i format izvještaja za preuzimanje.',
    'agency.period': 'Period',
    'agency.format': 'Format',
    'agency.generateReport': 'Generiši izvještaj',
    'agency.reportQueued':
      'Izvještaj u {format} formatu je zatražen. Backend će ga generisati kada API bude spreman.',
    'agency.alarmsLabel': 'Alarmi',
    'agency.alarmsTitle':
      'Upozorenja o neuobičajenoj aktivnosti',
    'agency.alarmsDescription':
      'Alarm se aktivira kada saobraćaj naglo poraste iznad postavljenog praga.',
    'agency.alarmsEnabled': 'Alarmi uključeni',
    'agency.spikeThreshold':
      'Prag skoka saobraćaja: {percent}%',
    'agency.notifyByEmail': 'Obavijesti me emailom',
    'agency.logLabel': 'Evidencija',
    'agency.logTitle': 'Istorija događaja',
    'agency.logDescription':
      'Događaji sa vremenskim pečatom, za potrebe sigurnosnog izvještavanja.',
    'agency.levelInfo': 'Info',
    'agency.levelWarning': 'Upozorenje',
    'agency.levelAlert': 'Alarm',
    'agency.eventSpike':
      'Naglo povećanje saobraćaja iznad postavljenog praga.',
    'agency.eventNewDevice':
      'Novi uređaj se povezao na mrežu.',
    'agency.eventBlocked':
      'Blokiran pristup domenu sa liste rizika.',
    'agency.eventUpdate':
      'Sistemsko ažuriranje je instalirano.',
    'agency.eventNightly':
      'Noćna provjera sistema završena bez grešaka.',
    'agency.legalNote':
      'Obim i trajanje čuvanja evidencije moraju biti usklađeni sa pravnim okvirom prije produkcije.',

    'upgrade.title': 'Nadogradnja kapaciteta',
    'upgrade.subtitle':
      'Povećajte broj korisnika koje vaš Fornect uređaj podržava.',
    'upgrade.currentLabel': 'Trenutni plan',
    'upgrade.currentPlan': '{users} od {capacity} korisnika',
    'upgrade.description':
      'Kapacitet određuje koliko se uređaja može istovremeno povezati i biti zaštićeno.',
    'upgrade.currentTier': 'Vaš trenutni plan',
    'upgrade.contactSales': 'Kontaktiraj prodaju',
    'upgrade.tierStandard':
      'Standardni kapacitet Fornect Pro uređaja.',
    'upgrade.tierExtended':
      'Prošireni kapacitet za veće objekte i mreže.',
    'upgrade.pricingNote':
      'Cijene i komercijalni uslovi još nisu definisani. Nakon zahtjeva kontaktiramo vas sa ponudom.',
    'upgrade.requestSent':
      'Zahtjev za nadogradnju na {users} korisnika je zabilježen. Kontaktiraćemo vas u vezi uslova.',

    'settings.deviceLabel': 'Uređaj',
    'settings.deviceMode': 'Softverski mod uređaja',
    'settings.deviceModeDescription':
      'Mod određuje koji se panel prikazuje: Home ili Pro (Hospitality ili Agency).',
    'settings.deviceModePocNote':
      'POC mod — u produkciji aplikacija čita tip uređaja i mod sa backend-a pri prijavi, pa se ovdje ne bi ručno mijenjao.',

    'connection.label': 'Veza',
    'connection.offlineTitle': 'Fornect uređaj nije dostupan',
    'connection.offlineDescription':
      'Ne možemo trenutno doći do uređaja. Prikazano je posljednje poznato stanje, a promjene će se primijeniti kada se veza vrati.',
    'connection.errorTitle': 'Greška u komunikaciji sa uređajem',
    'connection.errorDescription':
      'Uređaj je odgovorio greškom. Prikazano je posljednje poznato stanje.',
    'connection.lastKnown': 'Posljednje poznato stanje: {time}',
    'connection.justNow': 'upravo sada',
    'connection.minutesAgo': 'prije {minutes} min',
    'connection.hoursAgo': 'prije {hours} h',
    'connection.neverSynced': 'nije još sinhronizovano',
    'connection.retry': 'Pokušaj ponovo',
    'connection.statusOnline': 'Povezano',
    'connection.statusOffline': 'Nije dostupno',
    'connection.statusError': 'Greška',
    'connection.simulateTitle': 'Stanje veze sa uređajem',
    'connection.simulateDescription':
      'Provjerite kako aplikacija izgleda kada uređaj nije dostupan ili vrati grešku.',
    'connection.simulatePocNote':
      'POC mod — u produkciji stanje veze dolazi iz odgovora backend API-ja, a ne bira se ručno.',

    'protection.platformAndroid':
      'Android telefon',
    'protection.platformIos':
      'iPhone ili iPad',
    'protection.platformWindows':
      'Windows',
    'protection.platformMac':
      'Mac',
    'protection.androidStep1':
      'Na uređaju koji štitite otvorite ovu stranicu i preuzmite Fornect certifikat.',
    'protection.androidStep2':
      'Otvorite Postavke, pa Sigurnost i privatnost.',
    'protection.androidStep3':
      'Pronađite stavku za instalaciju certifikata i izaberite preuzeti fajl.',
    'protection.androidStep4':
      'Potvrdite naziv Fornect i, ako telefon zatraži, unesite PIN ili otisak prsta.',
    'protection.androidStep5':
      'Vratite se ovdje i potvrdite da je profil instaliran.',
    'protection.androidFirefoxNote':
      'Firefox na Androidu drži vlastitu listu certifikata i ne koristi sistemsku. Ako ga koristite, certifikat morate dodati i u sam Firefox — u suprotnom on ostaje bez pune zaštite.',
    'protection.androidNote':
      'Na novijim Android verzijama certifikat važi za internet preglednik, dok pojedine aplikacije nastavljaju sa standardnom zaštitom.',
    'protection.iosStep1':
      'Na uređaju koji štitite otvorite ovu stranicu i preuzmite Fornect profil.',
    'protection.iosStep2':
      'Otvorite Postavke — na vrhu će se pojaviti stavka Preuzeti profil.',
    'protection.iosStep3':
      'Dodirnite Instaliraj i unesite kod uređaja.',
    'protection.iosStep4':
      'Otvorite Postavke, pa Općenito, Info, i uključite Fornect u postavkama pouzdanosti certifikata.',
    'protection.iosStep5':
      'Vratite se ovdje i potvrdite da je profil instaliran.',
    'protection.iosNote':
      'Korak sa postavkama pouzdanosti je obavezan. Bez njega iPhone neće koristiti punu zaštitu.',
    'protection.windowsStep1':
      'Preuzmite Fornect certifikat na računar.',
    'protection.windowsStep2':
      'Dvoklik na preuzeti fajl, pa izaberite „Install Certificate".',
    'protection.windowsStep3':
      'Izaberite „Local Machine" i potvrdite upit sistema za dozvolu.',
    'protection.windowsStep4':
      'Izaberite „Place all certificates in the following store", odaberite „Trusted Root Certification Authorities" i potvrdite.',
    'protection.windowsStep5':
      'Vratite se ovdje i potvrdite da je profil instaliran.',
    'protection.windowsNote':
      'Chrome i Edge koriste sistemsku listu certifikata, pa im je ovo dovoljno. Firefox drži vlastitu listu i treba ga dodati zasebno, u njegovim postavkama.',
    'protection.macStep1':
      'Preuzmite Fornect certifikat na Mac.',
    'protection.macStep2':
      'Dvoklik na preuzeti fajl — otvara se Keychain Access (Pristup ključevima).',
    'protection.macStep3':
      'Izaberite keychain „System" i unesite administratorsku lozinku.',
    'protection.macStep4':
      'Nađite Fornect u listi, dvoklik na njega, otvorite odjeljak „Trust" i postavite „When using this certificate" na „Always Trust".',
    'protection.macStep5':
      'Vratite se ovdje i potvrdite da je profil instaliran.',
    'protection.macNote':
      'Safari i Chrome koriste sistemski keychain. Firefox drži vlastitu listu i treba ga dodati zasebno, u njegovim postavkama.',
    'protection.pinningNote':
      'Pojedine aplikacije, poput bankovnih, namjerno odbijaju ovakvu zaštitu. Za njih ostaje standardna zaštita — to je očekivano i nije greška.',

    'devices.network': 'Fornect mreža',
    'devices.title': 'Uređaji',
    'devices.subtitle': 'Upravljajte uređajima povezanim na vašu mrežu.',
    'devices.online': 'Online',
    'devices.protected': 'Zaštićeni',
    'devices.unassigned': 'Nedodijeljeni',
    'devices.networkDevices': 'Mrežni uređaji',
    'devices.discoveredAutomatically':
      'Fornect automatski otkriva uređaje na mreži.',
    'devices.noProfile': 'Nije dodijeljen profil',
    'devices.childProfile': 'Dječiji profil',
    'devices.teenProfile': 'Tinejdžerski profil',
    'devices.adultProfile': 'Profil odrasle osobe',
    'devices.adminProfile': 'Administratorski profil',
    'devices.fullProtection': 'Puna zaštita',
    'devices.standardProtection': 'Standardna zaštita',
    'devices.needsSetup': 'Potrebno podešavanje',
    'devices.protectionOff': 'Zaštita isključena',
    'devices.setup': 'Podesi',
    'devices.manage': 'Upravljaj',
    'devices.emptyTitle':
      'Nema povezanih uređaja',
    'devices.emptyDescription':
      'Fornect uređaj još nije uparen s ovim nalogom. Upari ga da bi Fornect počeo otkrivati uređaje na vašoj mreži.',
    'devices.pairDevice':
      'Upari Fornect uređaj',

    'devices.limitReachedTitle':
      'Kapacitet licence je prekoračen',
    'devices.limitReachedDescription':
      'Licenca vašeg Fornect uređaja pokriva {limit} uređaja. Preko toga ih je {count} — oni nisu registrovani i ne dobijaju uslugu dok se mjesto ne oslobodi.',
    'devices.limitReachedAction':
      'Pogledaj detalje',

    'capacity.eyebrow': 'LICENCA',
    'capacity.title': 'Kapacitet je pun',
    'capacity.subtitle':
      'Uređaja na mreži: {used}. Licenca pokriva {capacity}.',
    'capacity.whatItMeans': 'Šta ovo znači',
    'capacity.explanation':
      'Licenca vašeg Fornect uređaja pokriva određen broj uređaja. Oni koji su se pojavili poslije tog broja nisu registrovani, pa im Fornect ne pruža uslugu — ni razrješavanje imena ni filtriranje. Bez toga preko ove mreže nemaju pristup internetu.',
    'capacity.notBlockedNote':
      'Ograničenje se primjenjuje pri registraciji uređaja — ovdje, a ne u DNS-u ni u proxyju. Sam Fornect uređaj dodatno pazi da broj aktivnih uređaja ne prekorači licencu.',
    'capacity.overflowTitle': 'Izvan licence: {count}',
    'capacity.slot': 'Mjesto',
    'capacity.openDevice': 'Otvori uređaj',
    'capacity.freeUpSlot': 'Oslobodi mjesto',
    'capacity.upgrade': 'Proširi licencu',
    'capacity.contact': 'Kontaktiraj podršku',
    'capacity.okTitle': 'Kapacitet nije pun',
    'capacity.okBody':
      'Na mreži je {used} uređaja, a licenca pokriva {capacity}. Svi su unutar zaštite.',
    'capacity.noHubTitle': 'Nema uparenog Fornect uređaja',
    'capacity.noHubBody':
      'Licenca dolazi sa Fornect uređajem. Dok nijedan nije uparen sa ovim nalogom, nema ni granice koju bi panel mogao provjeriti.',
    'capacity.allDevices': 'Svi uređaji',
    'deviceDetails.device': 'Uređaj',
    'deviceDetails.subtitle':
      'Upravljajte profilom, zaštitom i pristupom internetu.',
    'deviceDetails.backToDevices': 'Nazad na uređaje',
    'deviceDetails.save': 'Sačuvaj',
    'deviceDetails.cancel': 'Odustani',
    'deviceDetails.rename': 'Preimenuj',
    'deviceDetails.unassigned': 'Nedodijeljeno',
    'deviceDetails.profile': 'Profil',
    'deviceDetails.child': 'Dijete',
    'deviceDetails.teen': 'Tinejdžer',
    'deviceDetails.adult': 'Odrasli',
    'deviceDetails.admin': 'Administrator',
    'deviceDetails.profileAssigned':
      'Ovaj uređaj koristi profil {profile}.',
    'deviceDetails.assignProfile':
      'Dodijelite profil da biste počeli upravljati uređajem.',
    'deviceDetails.changeProfile': 'Promijeni profil',

    'deviceDetails.protection': 'Zaštita',
    'deviceDetails.fullProtection': 'Puna zaštita',
    'deviceDetails.standardProtection': 'Standardna zaštita',
    'deviceDetails.needsSetup': 'Potrebno podešavanje',
    'deviceDetails.protectionOff': 'Zaštita isključena',
    'deviceDetails.manageProtection':
      'Upravljajte nivoom zaštite i Fornect zaštitnim profilom.',
    'deviceDetails.protectionSettings': 'Postavke zaštite',

    'deviceDetails.internetSchedule': 'Internet raspored',
    'deviceDetails.noSchedule': 'Nema rasporeda',
    'deviceDetails.perDaySchedule': 'Različito po danu',
    'deviceDetails.noRestrictions':
      'Nisu podešena automatska ograničenja interneta.',
    'deviceDetails.followsBedtime':
      'Pristup internetu prati podešeni raspored spavanja.',
    'deviceDetails.currentStatus': 'Trenutni status',
    'deviceDetails.editSchedule': 'Uredi raspored',

    'deviceDetails.noBedtimeActive':
      'Nijedan raspored spavanja nije aktivan.',
    'deviceDetails.temporaryAccessRemaining':
      'Privremeni pristup internetu aktivan je još {minutes} min.',
    'deviceDetails.pausedByBedtime':
      'Internet za {name} je trenutno pauziran prema rasporedu spavanja.',
    'deviceDetails.turnsOffMinutes':
      'Internet za {name} se isključuje za {minutes} min.',
    'deviceDetails.turnsOffHours':
      'Internet za {name} se isključuje za {hours} h.',
    'deviceDetails.turnsOffHoursMinutes':
      'Internet za {name} se isključuje za {hours} h {minutes} min.',
    'deviceDetails.nextBedtime':
      'Sljedeće vrijeme spavanja: {day} u {time}.',
    'deviceDetails.noUpcomingBedtime':
      'Nema narednog zakazanog vremena spavanja.',

    'deviceDetails.daySun': 'Ned',
    'deviceDetails.dayMon': 'Pon',
    'deviceDetails.dayTue': 'Uto',
    'deviceDetails.dayWed': 'Sri',
    'deviceDetails.dayThu': 'Čet',
    'deviceDetails.dayFri': 'Pet',
    'deviceDetails.daySat': 'Sub',

    'deviceDetails.internetNow': 'Internet sada',
    'deviceDetails.temporarilyAllowed': 'Privremeno dozvoljen',
    'deviceDetails.paused': 'Pauzirano',
    'deviceDetails.allowedUntilEndToday':
      'Pristup internetu je privremeno dozvoljen do kraja dana.',
    'deviceDetails.allowedForMinutes':
      'Pristup internetu je privremeno dozvoljen još {minutes} min.',
    'deviceDetails.endOverride': 'Prekini privremeni pristup',
    'deviceDetails.allowOutsideSchedule':
      'Privremeno dozvolite pristup internetu izvan rasporeda.',
    'deviceDetails.oneHour': '1 sat',
    'deviceDetails.untilEndOfDay': 'Do kraja dana',

    'deviceDetails.nameRequired':
      'Naziv uređaja ne može biti prazan.',
    'deviceDetails.nameTooLong':
      'Naziv uređaja ne može imati više od 40 znakova.',

    'deviceSetup.eyebrow': 'Podešavanje uređaja',
    'deviceSetup.title': 'Podesi novi uređaj',
    'deviceSetup.subtitle':
      'Imenujte uređaj, odaberite profil i nivo zaštite.',
    'deviceSetup.backToDevices': 'Nazad na uređaje',

    'deviceSetup.deviceName': 'Naziv uređaja',
    'deviceSetup.whatDevice': 'Koji je ovo uređaj?',
    'deviceSetup.nameHint':
      'Dajte uređaju naziv koji ćete kasnije lako prepoznati.',
    'deviceSetup.namePlaceholder': 'npr. Aminin tablet',

    'deviceSetup.profile': 'Profil',
    'deviceSetup.whoUses': 'Ko koristi ovaj uređaj?',
    'deviceSetup.chooseProfile':
      'Odaberite profil zaštite za ovaj uređaj.',

    'deviceSetup.child': 'Dijete',
    'deviceSetup.childDescription':
      'Stroga roditeljska zaštita',

    'deviceSetup.teen': 'Tinejdžer',
    'deviceSetup.teenDescription':
      'Uravnotežene roditeljske kontrole',

    'deviceSetup.adult': 'Odrasli',
    'deviceSetup.adultDescription':
      'Standardna mrežna zaštita',

    'deviceSetup.admin': 'Administrator',
    'deviceSetup.adminDescription':
      'Vlasnik ili pouzdani uređaj',

    'deviceSetup.protection': 'Zaštita',
    'deviceSetup.chooseProtection':
      'Odaberite nivo zaštite',
    'deviceSetup.changeLater':
      'Ovo možete kasnije promijeniti u postavkama uređaja.',

    'deviceSetup.standardProtection':
      'Standardna zaštita',
    'deviceSetup.standardDescription':
      'DNS filtriranje — oko 64% poznatih domena za reklame i praćenje',

    'deviceSetup.fullProtection':
      'Puna zaštita',
    'deviceSetup.fullDescription':
      'Uz zaštitni profil — 70–85% zahtjeva, ali nikad sve',

    'deviceSetup.cancel': 'Odustani',
    'deviceSetup.finish': 'Završi podešavanje',

    'schedule.eyebrow': 'Internet raspored',
    'schedule.subtitle':
      'Odaberite kada pristup internetu treba biti pauziran.',
    'schedule.backToDevice': 'Nazad na uređaj',
    'schedule.bedtime': 'Vrijeme spavanja',
    'schedule.internetUnavailable': 'Internet nije dostupan',
    'schedule.from': 'Od',
    'schedule.until': 'Do',
    'schedule.modeLabel': 'Kada raspored važi',
    'schedule.sameEveryDay': 'Isto svaki dan',
    'schedule.perDay': 'Različito po danu',
    'schedule.perDayHint':
      'Izaberite različito vrijeme za radne dane i vikend, ili za svaki dan posebno.',
    'schedule.perDaySummary':
      'Postavljeno je vrijeme za {count} dana u sedmici.',
    'schedule.noDaysSummary':
      'Nijedan dan nije izabran, pa se raspored neće primijeniti.',
    'schedule.dayOff': 'Bez rasporeda',

    'schedule.days': 'Dani',
    'schedule.active': 'Aktivan raspored',
    'schedule.disabled': 'Raspored isključen',
    'schedule.disabledSummary':
      'Raspored vremena spavanja je isključen.',
    'schedule.activeSummary':
      'Internet će biti pauziran od {start} do {end}, {days}.',
    'schedule.everyDay': 'svaki dan',
    'schedule.mondayToFriday': 'od ponedjeljka do petka',
    'schedule.noDays': 'nije odabran nijedan dan',
    'schedule.saved': 'Raspored je uspješno sačuvan.',
    'schedule.cancel': 'Odustani',
    'schedule.save': 'Sačuvaj raspored',

    'protection.eyebrow': 'Zaštita',
    'protection.subtitle':
      'Upravljajte nivoom zaštite za ovaj uređaj.',
    'protection.backToDevice': 'Nazad na uređaj',

    'protection.fornectProtection': 'Fornect zaštita',
    'protection.isOn': 'Zaštita je uključena',
    'protection.isOff': 'Zaštita je isključena',
    'protection.activeDescription':
      'Fornect aktivno štiti ovaj uređaj.',
    'protection.offDescription':
      'Filtriranje i zaštita su privremeno isključeni za ovaj uređaj.',

    'protection.today': 'Danas',
    'protection.adsBlocked':
      'blokiranih reklama na ovom uređaju',

    'protection.awayTitle': 'Zaštita izvan kuće',
    'protection.awayHeading':
      'Zaštitite ovaj uređaj gdje god se nalazio',
    'protection.awayDescription':
      'Fornect može nastaviti štititi uređaj i kada koristi mobilni internet, javni Wi-Fi ili drugu mrežu.',
    'protection.awayDisabled':
      'Uključite Fornect zaštitu da biste koristili ovu funkciju.',

    'protection.on': 'Uključeno',
    'protection.off': 'Isključeno',
    'protection.paused': 'Pauzirano',

    'protection.currentProtection': 'Trenutna zaštita',
    'protection.configuredProtection': 'Podešena zaštita',
    'protection.active': 'Aktivna',

    'protection.full': 'Puna zaštita',
    'protection.standard': 'Standardna zaštita',
    'protection.fullDescription':
      'DNS filtriranje uz pregled web saobraćaja. Zaustavlja 70–85% zahtjeva za reklame i praćenje. Traži instaliran zaštitni profil.',
    'protection.coverageNote':
      'Nijedan nivo ne zaustavlja sve. Aplikacije koje zaobilaze sistemski pregled, QUIC/HTTP3 saobraćaj i servisi sa ugrađenim certifikatom uvijek propuste dio. Navedene brojke su iz mjerenja, ne obećanje.',
    'protection.adsBlockedNote':
      'Broji zahtjeve zaustavljene na DNS nivou — reklame se ne uklanjaju sa stranice, pa dio može ostati vidljiv. Reklame unutar aplikacija i u video sadržaju se ovako ne vide.',
    'protection.standardDescription':
      'Filtriranje na nivou DNS-a. Zaustavlja oko 64% poznatih domena za reklame i praćenje. Certifikat nije potreban.',
    'protection.levelSectionLabel': 'NIVO ZAŠTITE',
    'protection.levelOff': 'Isključeno',
    'protection.levelOffDescription':
      'Fornect ne štiti ovaj uređaj. Saobraćaj prolazi bez filtriranja.',
    'protection.requiresProfile':
      'Zahtijeva instaliran zaštitni profil',
    'protection.removeProfile': 'Ukloni profil',
    'protection.certificatePrerequisite':
      'Zaštitni profil nije nivo zaštite nego preduslov za punu zaštitu. Dok je instaliran, možete slobodno birati između standardne i pune.',
    'protection.levelHint':
      'Prelazak sa pune na standardnu ne uklanja zaštitni profil — punu zaštitu možete vratiti bez ponovne instalacije.',
    'protection.pairedStandardChosen':
      'Zaštitni profil je instaliran, ali ovaj uređaj trenutno koristi standardnu zaštitu. Punu možete uključiti u svakom trenutku, bez ponovne instalacije.',

    'protection.certificatePairing':
      'Uparivanje zaštitnog profila',

    'protection.profileInstalled':
      'Zaštitni profil je instaliran',
    'protection.pairedEnabled':
      'Ovaj uređaj je uparen sa Fornectom i napredna zaštita je uključena.',
    'protection.pairedPaused':
      'Zaštitni profil ostaje instaliran. Zaštita je trenutno pauzirana i vratit će se na punu zaštitu kada je ponovo uključite.',
    'protection.paired': 'Upareno',
    'protection.certificateVerified':
      'Status zaštitnog profila je potvrđen.',
    'protection.reinstallProfile':
      'Ponovo instaliraj zaštitni profil',

    'protection.fullNotEnabled':
      'Puna zaštita nije uključena',
    'protection.pairToEnable':
      'Uparite ovaj uređaj sa Fornectom da biste uključili naprednu zaštitu.',
    'protection.startPairing': 'Pokreni uparivanje',

    'protection.installProfile':
      'Instalirajte Fornect zaštitni profil',
    'protection.installInstructions':
      'Pratite korake instalacije na ovom uređaju, a zatim potvrdite kada je zaštitni profil instaliran.',
    'protection.waitingConfirmation':
      'Čeka se potvrda',
    'protection.pairingInProgress':
      'Uparivanje je trenutno u toku.',
    'protection.installationFailed':
      'Instalacija nije uspjela',
    'protection.profileInstalledButton':
      'Profil je instaliran',

    'protection.pairingFailed':
      'Uparivanje nije uspjelo',
    'protection.couldNotVerify':
      'Fornect nije mogao potvrditi zaštitni profil na ovom uređaju.',
    'protection.notVerified':
      'Zaštitni profil nije potvrđen',
    'protection.tryInstallationAgain':
      'Pokušajte ponovo instalirati profil.',
    'protection.tryAgain': 'Pokušaj ponovo',

    'notifications.title': 'Obavijesti',
    'notifications.subtitle':
      'Važne informacije o vašim uređajima i zaštiti.',
    'notifications.inbox': 'Pristiglo',
    'notifications.markAll': 'Označi sve kao pročitano',
    'notifications.markRead': 'Označi kao pročitano',

    'notifications.justNow': 'upravo sada',
    'notifications.minutesAgo': 'prije {minutes} min',
    'notifications.todayAt': 'danas u {time}',
    'notifications.yesterdayAt': 'jučer u {time}',
    'notifications.onDateAt': '{date} u {time}',

    'notifications.emptyTitle': 'Nema obavijesti',
    'notifications.emptyMessage':
      'Ovdje će se pojaviti kad se nešto desi — na primjer kad uređaj napusti mrežu u vrijeme kada bi trebao spavati.',

    'notifications.capacityReached':
      'Dostignut je limit kapaciteta',
    'notifications.capacityMessage':
      'Vaš Fornect uređaj podržava najviše {capacity} uređaja. Novi uređaji se neće moći dodati dok se neki ne ukloni.',
    'notifications.newDeviceTitle': 'Nov uređaj na mreži',
    'notifications.newDeviceMessage':
      'Uređaj „{name}" ({mac}) se pojavio na mreži i čeka vašu odluku. Do tada ima osnovnu zaštitu.',
    'notifications.consentFailedTitle': 'Puna zaštita nije uključena',
    'notifications.consentFailedMessage':
      'Na uređaju „{name}" pristanak je dat, ali instalacija certifikata nije prošla. Uređaj je ostao na osnovnoj zaštiti.',
    'notifications.reconsentTitle': 'Pristanak treba obnoviti',
    'notifications.reconsentMessage':
      'Politika je izmijenjena (verzija {version}). Uređaji sa pristankom datim po ranijim uslovima ({count}): {names}. Da bi puna zaštita na njima ostala u primjeni, politiku treba ponovo prihvatiti.',

    'portalBranding.eyebrow': 'MREŽA',
    'portalBranding.title': 'Tekst i brend portala',
    'portalBranding.subtitle':
      'Ovo vide uređaji koji se prvi put spoje na vašu mrežu.',
    'portalBranding.backToSettings': 'Nazad na postavke',
    'portalBranding.loading': 'Učitavanje…',
    'fleet.eyebrow': 'FLOTA',
    'fleet.title': 'Ažuriranje uređaja',
    'fleet.subtitle':
      'Kada se uređaji ažuriraju, kojim redom, i koje filter liste koriste.',
    'fleet.backToSettings': 'Nazad na postavke',
    'fleet.loading': 'Učitavanje…',
    'fleet.saved': 'Sačuvano.',
    'fleet.saveFailed': 'Snimanje nije uspjelo. Pokušajte ponovo.',
    'fleet.loadFailed': 'Podaci o flotu se ne mogu učitati.',
    'fleet.online': 'Na vezi',
    'fleet.offline': 'Nije na vezi',
    'fleet.pausedBadge': 'Ažuriranje pauzirano',
    'fleet.noHubTitle': 'Nema uparenog uređaja',
    'fleet.noHubBody':
      'Ažuriranje se podešava po Fornect uređaju. Uparite uređaj pa se ovdje pojavi.',
    'fleet.versionsTitle': 'Verzije na uređaju',
    'fleet.versionsPending':
      'Uređaj još ne prijavljuje verzije. Prikazaćemo ih čim ih pošalje u heartbeat-u — do tada ovdje nema šta pisati, a izmišljena verzija bi bila gora od prazne.',
    'fleet.ringTitle': 'Prsten ažuriranja',
    'fleet.ringHint':
      'Nova verzija prvo ide na klupu, pa na mali dio uređaja, pa na sve. Loše ažuriranje se tako zaustavi prije nego zahvati sve.',
    'fleet.ring.bench': 'Klupa',
    'fleet.ring.early': 'Prvih 5%',
    'fleet.ring.half': 'Polovina',
    'fleet.ring.all': 'Svi',
    'fleet.windowTitle': 'Prozor održavanja',
    'fleet.windowHint':
      'Uređaj se ažurira samo u ovom razmaku, po lokalnom vremenu vašeg naloga. Prozor smije prelaziti ponoć.',
    'fleet.windowStart': 'Od',
    'fleet.windowEnd': 'Do',
    'fleet.killTitle': 'Zaustavljanje ažuriranja',
    'fleet.killHintRunning':
      'Uređaj prima nova ažuriranja u prozoru održavanja.',
    'fleet.killHintPaused':
      'Uređaj ne prima nova ažuriranja. Ono što je već instalirano ostaje kako jeste.',
    'fleet.pause': 'Pauziraj ažuriranje',
    'fleet.resume': 'Nastavi ažuriranje',
    'fleet.listsTitle': 'Filter liste',
    'fleet.listUnnamed': 'Set bez oznake',
    'fleet.listCount': '{count} lista',
    'fleet.listNone':
      'Panel nema set lista za ovaj uređaj, pa uređaj koristi svoj ugrađeni.',
    'fleet.listFromRollback': 'Ovo je vraćen raniji set.',
    'fleet.listLabel': 'Oznaka seta',
    'fleet.listUrls': 'Adrese lista, jedna po redu',
    'fleet.listUrlsHint':
      'Samo https. Lista preko običnog http-a je lista koju neko na putu može zamijeniti — a ona određuje i šta se NE blokira.',
    'fleet.editLists': 'Uredi liste',
    'fleet.rollback': 'Vrati prethodni set',
    'fleet.rollbackUnavailable':
      'Nema ranijeg seta na koji bi se moglo vratiti.',
    'fleet.directSourceWarning':
      'Ove adrese se povlače direktno sa izvora. Za nekoliko uređaja to radi; za flotu ide naš mirror, jer direktan izvor uvede ograničenje broja zahtjeva i ostavi uređaje bez osvježene liste.',
    'fleet.configDelivered': 'Uređaj je potvrdio postavke (verzija {version}).',
    'fleet.configPending':
      'Postavke su snimljene (verzija {version}), ali ih uređaj još nije potvrdio.',
    'fleet.configNone':
      'Za ovaj uređaj još nije upisana nijedna konfiguracija, pa nema ni čega da stigne.',
    'fleet.missingTitle': 'Šta ovdje namjerno ne stoji',
    'fleet.missingBody':
      'Zdravstveni pregled flote — stopa blokiranja, greške na proxyju i broj pokušaja pokretanja — nije ovdje jer uređaj te podatke još ne šalje. Ekran koji ih crta prikazivao bi nule koje se ne razlikuju od stvarnih nula, a na osnovu takvog broja neko donese odluku.',
    'portalBranding.previewTitle': 'Kako će izgledati',
    'portalBranding.previewHint':
      'Prikazano je samo ono što ovdje mijenjate — zaglavlje, naslov i poruka. Ostatak portala (izbor zaštite, uputstvo za certifikat) je isti za sve i ne mijenja se.',
    'portalBranding.brandSection': 'Brend',
    'portalBranding.brandName': 'Naziv koji stoji na vrhu',
    'portalBranding.accentColor': 'Boja naglaska',
    'portalBranding.textSection': 'Tekst dobrodošlice',
    'portalBranding.textHint':
      'Portal govori jezikom gosta, a ne vašim — zato se tekst unosi na oba jezika.',
    'portalBranding.titleBs': 'Naslov (bosanski)',
    'portalBranding.messageBs': 'Poruka (bosanski)',
    'portalBranding.titleEn': 'Naslov (engleski)',
    'portalBranding.messageEn': 'Poruka (engleski)',
    'portalBranding.privacyUrl': 'Veza ka politici privatnosti',
    'portalBranding.privacyUrlHint':
      'Prikazuje se uz formu pristanka na portalu. GDPR traži da politika bude dostupna u trenutku kad se pristanak daje — pristanak bez uvida u to šta se sa podacima radi nije informisan pristanak. Prazno znači da se ne prikazuje ništa.',
    'portalBranding.supportContact': 'Kontakt u podnožju',
    'portalBranding.supportHint':
      'Prazno znači da se kontakt ne prikazuje.',
    'portalBranding.lockedTitle': 'Šta se ovdje ne može mijenjati',
    'portalBranding.lockedBody':
      'Brojke o dometu zaštite, njihove granice i uputstvo za instalaciju certifikata nisu podesivi. To su tvrdnje za koje Fornect odgovara, pa moraju biti iste svuda i provjerljive.',
    'portalBranding.savedWithVersion':
      'Sačuvano. Uređaji će preuzeti verziju {version}.',

    'newDevices.eyebrow': 'MREŽA',
    'newDevices.title': 'Novi uređaji',
    'newDevices.subtitle':
      'Uređaji koje još niste razvrstali.',
    'newDevices.hint':
      'Ovi uređaji su se pojavili na vašoj mreži, a niko još nije odlučio kakvu zaštitu dobijaju. Do odluke rade sa osnovnom zaštitom.',
    'newDevices.firstSeen': 'Prvi put viđen',
    'newDevices.basicProtection': 'Osnovna zaštita',
    'newDevices.fullProtection': 'Puna zaštita',
    'newDevices.autoGuestNote':
      'Uređaji bez ekrana — televizor, štampač, konzola — nikad se neće sami javiti. Zato se uređaj koji nakon 24 sata i dalje nije razvrstan sam svrstava među goste, uz osnovnu zaštitu.',
    'newDevices.emptyTitle': 'Nema novih uređaja',
    'newDevices.emptyBody':
      'Svaki uređaj na vašoj mreži je razvrstan. Kad se pojavi nepoznat, čekat će vas ovdje.',
    'newDevices.allDevices': 'Svi uređaji',
    'newDevices.bannerTitle': 'Novi uređaji čekaju odluku',
    'newDevices.bannerBody':
      'Pogledajte ih — među njima može biti i uređaj koji ne prepoznajete.',

    'notifications.deviceLeftNetwork':
      'Uređaj nije na mreži',
    'notifications.deviceLeftNetworkMessage':
      '{device} se više ne vidi na vašoj mreži. Fornect ga ne štiti dok se ne vrati.',
    'notifications.leftDuringSchedule':
      'Uređaj je napustio mrežu tokom zabrane',
    'notifications.leftDuringScheduleMessage':
      '{device} se odjavio sa mreže dok je vrijeme spavanja bilo aktivno. Provjerite koristi li mobilne podatke.',

    'offlineAlert.label': 'OBAVJEŠTENJA',
    'offlineAlert.title': 'Praćenje prisutnosti',
    'offlineAlert.toggle':
      'Javi mi kad ovaj uređaj nije na mreži',
    'offlineAlert.hint':
      'Podrazumijevano uključeno za dječije i tinejdžerske profile.',
    'offlineAlert.limitation':
      'Fornect vidi samo da uređaj nije na mreži. Ne može razlikovati namjerno gašenje od prazne baterije ili odlaska od kuće. Ako uređaj pređe na mobilne podatke, Fornect ga ne vidi — za to uključite zaštitu van kuće.',

    'login.tagline': 'Jednostavna zaštita vaše mreže.',
    'login.welcome': 'Dobro došli nazad',
    'login.subtitle':
      'Prijavite se da biste upravljali svojom Fornect mrežom.',
    'login.email': 'Email adresa',
    'login.password': 'Lozinka',
    'login.passwordPlaceholder': 'Unesite lozinku',
    'login.rememberMe': 'Zapamti me',
    'login.forgotPassword': 'Zaboravili ste lozinku?',
    'login.invalidCredentials':
      'Neispravna email adresa ili lozinka.',
    'login.signIn': 'Prijavi se',
    'login.newToFornect': 'Novi ste na Fornectu?',
    'login.createAccount': 'Kreiraj račun',
    'login.platform': 'Fornect platforma za zaštitu',

    'register.title': 'Kreirajte svoj račun',
    'register.subtitle':
      'Kreirajte Fornect račun kako biste započeli podešavanje uređaja za zaštitu.',
    'register.fullName': 'Ime i prezime',
    'register.namePlaceholder': 'Vaše ime',
    'register.email': 'Email adresa',
    'register.password': 'Lozinka',
    'register.passwordPlaceholder': 'Najmanje 8 znakova',
    'register.confirmPassword': 'Potvrdite lozinku',
    'register.confirmPlaceholder': 'Ponovite lozinku',
    'register.createAccount': 'Kreiraj račun',
    'register.alreadyHaveAccount': 'Već imate račun?',
    'register.signIn': 'Prijavite se',

    'register.enterName': 'Unesite svoje ime.',
    'register.invalidEmail':
      'Unesite ispravnu email adresu.',
    'register.passwordMin':
      'Lozinka mora imati najmanje 8 znakova.',
    'register.passwordMismatch':
      'Lozinke se ne podudaraju.',
    'register.emailExists':
      'Račun sa ovom email adresom već postoji.',
    'register.unable':
      'Nije moguće kreirati račun.',

    'verify.checkEmail': 'Provjerite svoj email',
    'verify.sentCode':
      'Poslali smo šestocifreni kod za potvrdu na',
    'verify.yourEmail': 'vašu email adresu',
    'verify.code': 'Kod za potvrdu',
    'verify.pocCode': 'POC kod za potvrdu:',
    'verify.enterCode': 'Unesite kod iz emaila.',
    'verify.resendFailed':
      'Slanje novog koda nije uspjelo. Pokušajte ponovo za koji trenutak.',
    'verify.invalidCode':
      'Kod za potvrdu nije ispravan.',
    'verify.codeSent':
      'Novi kod za potvrdu je poslan.',
    'verify.verifyEmail': 'Potvrdi email',
    'verify.resend':
      'Niste dobili kod? Pošalji ponovo',
    'verify.changeEmail':
      '← Promijeni email adresu',

    'verify.verified': 'Email potvrđen',
    'verify.accountVerified':
      'Vaš račun je potvrđen',
    'verify.verifiedDescription':
      'Vaša email adresa je uspješno potvrđena. Sljedeći korak je povezivanje fizičkog Fornect uređaja sa ovim računom.',
    'verify.nextStep': 'Sljedeći korak',
    'verify.connectDevice':
      'Povežite svoj Fornect uređaj',
    'verify.connectDescription':
      'Uparite fizički Fornect Home ili Pro uređaj koristeći QR kod ili serijski broj.',
    'verify.pairDevice': 'Upari uređaj →',

    'pair.tagline': 'Povežite svoj uređaj za zaštitu.',
    'pair.deviceSetup': 'Podešavanje uređaja',
    'pair.title': 'Uparite svoj Fornect uređaj',
    'pair.intro':
      'Povežite ovaj račun sa svojim fizičkim Fornect uređajem. Unesite 6-cifreni kod prikazan na uređaju.',

    'pair.scanQr': 'Skeniraj QR kod',
    'pair.scanQrDescription':
      'Koristite kod prikazan na Fornect uređaju.',
    'pair.serialNumber': 'Kod za uparivanje',
    'pair.serialDescription':
      'Ručno unesite 6-cifreni kod.',

    'pair.scanDeviceQr':
      'Skenirajte QR kod uređaja',
    'pair.realCameraDescription':
      'U pravoj aplikaciji ovdje će se otvoriti kamera i skenirati QR kod sa fizičkog Fornect uređaja.',
    'pair.simulateQr': 'Skeniraj QR kod',
    'pair.pocCamera':
      'POC način rada — skeniranje kamerom bit će povezano kasnije. Unesite kod ručno.',
    'pair.qrNotAvailable':
      'Skeniranje kamerom još nije povezano — unesite kod ručno.',

    'pair.deviceSerial': 'Kod za uparivanje',
    'pair.invalidSerial':
      'Kod je netačan, istekao je, ili je uređaj već uparen. Zatražite novi kod na uređaju.',
    'pair.pairDevice': 'Upari uređaj',
    'pair.cancel':
      'Odustani i vrati se na prijavu',

    'pair.paired': 'Uređaj je uparen',
    'pair.connected':
      '{name} je povezan',
    'pair.successDescription':
      'Vaš Fornect uređaj je uspješno uparen sa ovim računom.',
    'pair.device': 'Uređaj',
    'pair.mode': 'Način rada',
    'pair.continueDashboard':
      'Nastavi na početnu',

    'forgot.title': 'Zaboravili ste lozinku?',
    'forgot.subtitle':
      'Unesite svoju email adresu i poslat ćemo vam upute za resetovanje lozinke.',
    'forgot.email': 'Email adresa',
    'forgot.invalidEmail':
      'Unesite ispravnu email adresu.',
    'forgot.sendResetLink':
      'Pošalji link za resetovanje',
    'forgot.backToSignIn':
      '← Nazad na prijavu',
    'forgot.backToSignInButton':
      'Nazad na prijavu',
    'forgot.checkEmail':
      'Provjerite svoj email',
    'forgot.ifAccountExists':
      'Ako postoji račun za',
    'forgot.instructionsSent':
      'upute za resetovanje lozinke su poslane.',

    'schedule.daySun': 'Ned',
    'schedule.dayMon': 'Pon',
    'schedule.dayTue': 'Uto',
    'schedule.dayWed': 'Sri',
    'schedule.dayThu': 'Čet',
    'schedule.dayFri': 'Pet',
    'schedule.daySat': 'Sub',

    'schedules.title': 'Rasporedi',
    'schedules.dashboard': 'Početna',
    'schedules.deviceRoutines': 'Rutine uređaja',
    'schedules.heroDescription':
      'Postavite zdravo vrijeme korištenja interneta i automatski pauzirajte pristup kada je vrijeme za odmor.',
    'schedules.automaticControl': 'Automatska kontrola',
    'schedules.devices': 'Uređaji',
    'schedules.activeSchedules': 'Aktivni rasporedi',
    'schedules.disabled': 'Isključeni',
    'schedules.bedtimeControl': 'Kontrola vremena spavanja',
    'schedules.deviceSchedules': 'Rasporedi uređaja',
    'schedules.bedtime': 'Vrijeme spavanja',
    'schedules.active': 'Aktivan',
    'schedules.notScheduled': 'Nije zakazano',
    'schedules.perDay': 'Različito po danu',
    'schedules.scheduleDisabled': 'Raspored isključen',
    'schedules.everyDay': 'Svaki dan',
    'schedules.mondayFriday': 'Ponedjeljak – petak',
    'schedules.editSchedule': 'Uredi raspored',
    'schedules.noDevices': 'Još nema uređaja',
    'schedules.addDevice':
      'Dodajte uređaj prije kreiranja rasporeda.',

    'protectionOverview.title': 'Zaštita',
    'protectionOverview.dashboard': 'Početna',
    'protectionOverview.networkSecurity': 'Sigurnost mreže',
    'protectionOverview.description':
      'Pregledajte kako je svaki uređaj zaštićen i upravljajte uparivanjem certifikata za punu Fornect zaštitu.',
    'protectionOverview.active': 'Zaštita aktivna',
    'protectionOverview.full': 'Puna zaštita',
    'protectionOverview.standard': 'Standardna zaštita',
    'protectionOverview.needsSetup': 'Potrebno podešavanje',
    'protectionOverview.off': 'Zaštita isključena',
    'protectionOverview.protectedDevices': 'Zaštićeni uređaji',
    'protectionOverview.deviceProtection': 'Zaštita uređaja',
    'protectionOverview.protection': 'Zaštita',
    'protectionOverview.certificate': 'Certifikat',
    'protectionOverview.fullDescription':
      'Firewall + DNS + certifikat',
    'protectionOverview.standardDescription':
      'DNS i mrežna zaštita',
    'protectionOverview.setupDescription':
      'Potrebno je završiti podešavanje',
    'protectionOverview.offDescription':
      'Zaštita je trenutno isključena',
    'protectionOverview.paired': 'Uparen',
    'protectionOverview.pairing': 'Uparivanje',
    'protectionOverview.pairingFailed':
      'Uparivanje nije uspjelo',
    'protectionOverview.notPaired': 'Nije uparen',
    'protectionOverview.manage': 'Upravljaj zaštitom',
    'protectionOverview.noDevices': 'Još nema uređaja',
    'protectionOverview.addDevice':
      'Dodajte uređaj prije podešavanja zaštite.',

    'help.title': 'Pomoć i podrška',
    'help.subtitle':
      'Pronađite odgovore ili pošaljite zahtjev za podršku.',
    'help.backToSettings': '← Nazad na postavke',
    'help.faqLabel': 'Česta pitanja',
    'help.faqTitle': 'Kako vam možemo pomoći?',
    'help.faqDescription':
      'Najčešća pitanja o Fornect Home uređajima i zaštiti.',

    'help.deviceOfflineQuestion':
      'Šta ako je uređaj offline?',
    'help.deviceOfflineAnswer':
      'Provjerite da li je uređaj uključen i povezan na kućnu mrežu. Fornect prikazuje posljednje poznato stanje dok se uređaj ponovo ne poveže.',

    'help.profilesQuestion':
      'Kako rade Child, Teen, Adult i Admin profili?',
    'help.profilesAnswer':
      'Profil određuje nivo ograničenja uređaja. Child i Teen profili koriste strožija pravila, dok Adult i Admin omogućavaju širi pristup.',

    'help.scheduleQuestion':
      'Kako radi raspored vremena spavanja?',
    'help.scheduleAnswer':
      'Raspored automatski pauzira pristup internetu u odabranom periodu i danima.',

    'help.protectionQuestion':
      'Koja je razlika između Standardne i Pune zaštite?',
    'help.protectionAnswer':
      'Standardna zaštita filtrira na nivou DNS-a i zaustavlja oko 64% poznatih domena za reklame i praćenje. Puna zaštita uz instaliran zaštitni profil pregleda i web saobraćaj, pa doseže 70–85% zahtjeva. Nijedan nivo ne zaustavlja sve: aplikacije koje zaobilaze sistemski pregled, QUIC/HTTP3 saobraćaj i servisi sa ugrađenim certifikatom uvijek propuste dio.',

    'help.pairingQuestion':
      'Šta znači uparivanje zaštitnog profila?',
    'help.pairingAnswer':
      'Uparivanje povezuje uređaj sa Fornect zaštitnim profilom kako bi se omogućile funkcije Pune zaštite.',

    'help.overrideQuestion':
      'Mogu li privremeno dozvoliti internet izvan rasporeda?',
    'help.overrideAnswer':
      'Da. Emergency Override može privremeno omogućiti internet na 15 ili 30 minuta, jedan sat ili do kraja dana.',

    'help.supportLabel': 'Podrška',
    'help.contactSupport': 'Kontaktirajte podršku',
    'help.supportDescription':
      'Opišite problem i Fornect podrška će moći pregledati vaš zahtjev.',
    'help.category': 'Kategorija',
    'help.categoryGeneral': 'Općenito',
    'help.categoryDevice': 'Uređaj',
    'help.categoryProtection': 'Zaštita',
    'help.categorySchedule': 'Raspored',
    'help.categoryAccount': 'Račun',
    'help.message': 'Poruka',
    'help.messagePlaceholder':
      'Opišite problem ili pitanje...',
    'help.messageTooShort':
      'Molimo unesite najmanje 10 znakova.',
    'help.sendRequest': 'Pošalji zahtjev',
    'help.requestReceived':
      'Zahtjev za podršku je zaprimljen.',
    'help.pocNote':
      'POC način rada — slanje zahtjeva će kasnije biti povezano sa backend servisom.',
    'protectionOverview.childProfile': 'Dječiji profil',
    'protectionOverview.teenProfile': 'Tinejdžerski profil',
    'protectionOverview.adultProfile': 'Profil za odrasle',
    'protectionOverview.adminProfile': 'Administratorski profil',
    'protectionOverview.unassigned': 'Profil nije dodijeljen',

    'settings.title': 'Postavke računa',
    'settings.subtitle':
      'Upravljajte računom i postavkama obavijesti.',
    'settings.account': 'Račun',
    'settings.yourAccount': 'Vaš račun',
    'settings.name': 'Ime',
    'settings.email': 'Email',
    'settings.language': 'Jezik',
    'settings.interfaceLanguage': 'Jezik interfejsa',
    'settings.bosnianPrimary':
      'Bosanski je primarni jezik Fornect aplikacije.',
    'settings.bosnian': 'Bosanski',
    'settings.primaryLanguage': 'Primarni jezik',
    'settings.english': 'English',
    'settings.optionalLanguage': 'Opcionalni jezik',
    'settings.emailPreferences': 'Email postavke',
    'settings.emailNotifications': 'Email obavijesti',
    'settings.chooseEmails':
      'Izaberite koje važne Fornect događaje želite primati i putem emaila.',
    'settings.deviceOffline': 'Uređaj offline',
    'settings.deviceOfflineDescription':
      'Pošalji mi email kada Fornect uređaj izgubi vezu.',
    'settings.protectionAlerts': 'Upozorenja zaštite',
    'settings.protectionAlertsDescription':
      'Primaj važna sigurnosna upozorenja i upozorenja zaštite.',
    'settings.softwareUpdates': 'Ažuriranja softvera',
    'settings.softwareUpdatesDescription':
      'Obavijesti me kada je dostupno Fornect ažuriranje.',
    'settings.savePreferences': 'Sačuvaj postavke',
    'settings.security': 'Sigurnost',
    'settings.changePassword': 'Promijeni lozinku',
    'settings.currentPassword': 'Trenutna lozinka',
    'settings.newPassword': 'Nova lozinka',
    'settings.confirmPassword': 'Potvrdi novu lozinku',
    'settings.fornectUser': 'Fornect korisnik',
    'settings.demoNotice':
      'Koristite Fornect demo račun. Lozinka ovog računa je fiksna u POC verziji.',
    'settings.demoPasswordFixed':
      'Lozinka demo računa ne može se promijeniti u ovoj POC verziji.',
    'settings.enterCurrentPassword':
      'Unesite trenutnu lozinku.',
    'settings.passwordMin':
      'Nova lozinka mora imati najmanje 8 znakova.',
    'settings.passwordMismatch':
      'Nove lozinke se ne podudaraju.',
    'settings.passwordBackendReady':
      'Promjena lozinke je spremna za povezivanje sa backendom.',

    'protectionOverview.guest': 'Osnovna zaštita',
    'consent.formTitle': 'Pristanak na punu zaštitu',
    'consent.formIntro':
      'Puna zaštita znači da Fornect uređaj pregleda i zaštićeni (HTTPS) saobraćaj ovog uređaja. Zato je potreban izričit pristanak, koji ostaje zabilježen.',
    'consent.guardianName': 'Ime i prezime osobe koja daje pristanak',
    'consent.guardianRelation': 'Odnos prema korisniku uređaja',
    'consent.relationPlaceholder':
      'npr. roditelj, staratelj, vlasnik uređaja',
    'consent.isMinor': 'Uređaj koristi maloljetna osoba',
    'consent.acceptPolicy':
      'Pročitao sam i prihvatam politiku pregleda saobraćaja',
    'consent.scopeNote':
      'Pristanak se odnosi samo na ovaj uređaj i može se opozvati u svakom trenutku.',
    'consent.cancel': 'Odustani',
    'consent.submit': 'Dajem pristanak',
    'consent.errorFields':
      'Unesite ime i odnos prema korisniku uređaja.',
    'consent.errorPolicy':
      'Morate prihvatiti politiku da biste nastavili.',
    'consent.errorServer':
      'Radnja nije uspjela. Provjerite vezu i pokušajte ponovo.',
    'consent.failedByUser':
      'Korisnik je prijavio da instalacija nije uspjela.',
    'consent.reacceptTitle': 'Politika je izmijenjena',
    'consent.reacceptBody':
      'Uslovi pod kojima je pristanak dat su u međuvremenu izmijenjeni. Da bi puna zaštita ostala u primjeni, politiku treba ponovo prihvatiti.',
    'consent.reacceptButton': 'Pregledaj i prihvati',
    'consent.recordLabel': 'ZAPIS PRISTANKA',
    'consent.grantedAt': 'Dat',
    'consent.policyVersion': 'Verzija politike',
    'consent.proof': 'Potvrda',
    'consent.proofManual':
      'Ručno potvrđeno (nije tehnički provjereno)',
    'consent.proofVerified': 'Tehnički provjereno na uređaju',
    'consent.minorNote':
      'Zabilježeno je da uređaj koristi maloljetna osoba i da pristanak daje staratelj.',
    'consent.revoke': 'Opozovi pristanak',
    'consent.guestNote':
      'Ovaj uređaj trenutno koristi osnovnu zaštitu. Pristanak je ranije opozvan ili nije ni dat.',
    'consent.startWithConsent': 'Nastavi uz pristanak',
    'consent.removeCertTitle':
      'Uklonite certifikat sa uređaja',
    'consent.removeCertBody':
      'Presretanje je zaustavljeno, ali Fornect certifikat je i dalje instaliran na uređaju i taj uređaj mu i dalje vjeruje. Uklonite ga:',
    'consent.removeCertAndroid':
      'Android: Postavke → Sigurnost → Certifikati → obrišite Fornect (i posebno u Firefoxu, ako ga koristite).',
    'consent.removeCertIos':
      'iPhone i iPad: Postavke → Općenito → VPN i upravljanje uređajem → uklonite Fornect profil.',
    'consent.removeCertDesktop':
      'Računar: otvorite upravljanje certifikatima i obrišite Fornect iz pouzdanih izdavača, te iz samog preglednika ako drži vlastitu listu.',
    'consent.downloadCertificate': 'Preuzmi certifikat',
    'consent.fingerprintLabel': 'OTISAK CERTIFIKATA',
    'consent.fingerprintHint':
      'Uporedite ovaj otisak sa onim koji uređaj prikazuje pri instalaciji. Ako se ne podudaraju, prekinite instalaciju.',
    'consent.fingerprintPending':
      'Otisak će biti prikazan kada Fornect uređaj bude povezan — do tada ga nema čime provjeriti.',
    'consent.verificationPending':
      'Kada Fornect uređaj bude povezan, instalacija se provjerava sama. Do tada potvrdite ručno — takva potvrda se u zapisu označava kao neprovjerena.',
    'consent.consentStillValid':
      'Pristanak i dalje važi — ponavlja se samo instalacija certifikata.'
  },

  en: {
    'common.backToDashboard': 'Back to dashboard',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.saved': 'Saved',
    'common.on': 'On',
    'common.off': 'Off',
    'common.online': 'Online',
    'common.offline': 'Offline',
    'common.logout': 'Logout',
    'common.notifications': 'Notifications',
    'common.settings': 'Settings',

    'dashboard.title': 'Network protection dashboard',
    'dashboard.protectionStatus': 'Protection status',
    'dashboard.networkProtected': 'Your network is protected',
    'dashboard.internetPaused': 'Internet is paused',
    'dashboard.monitoring':
      'Fornect is active and monitoring your network.',
    'dashboard.pausedMessage':
      'Internet access is currently paused for all devices.',
    'dashboard.devicesOnline': 'Devices online',
    'dashboard.protectedDevices': 'Protected devices',
    'dashboard.childProfiles': 'Child profiles',
    'dashboard.internetPausedCount': 'Internet paused',
    'dashboard.fornectDevice': 'Fornect device',
    'dashboard.mainDevice': 'Main network protection device',
    'dashboard.software': 'Software',
    'dashboard.lastSeen': 'Last seen',
    'dashboard.justNow': 'Just now',
    'dashboard.quickActions': 'Quick actions',
    'dashboard.devices': 'Devices',
    'dashboard.pauseInternet': 'Pause internet',
    'dashboard.resumeInternet': 'Resume internet',
    'dashboard.schedules': 'Schedules',
    'dashboard.protection': 'Protection',

    'restrictions.label': 'Content',
    'restrictions.title': 'Content restrictions',
    'restrictions.description':
      'Rules are applied automatically based on the profile ({profile}), but you can customize them for this device.',
    'restrictions.profileDefaults': 'Profile defaults',
    'restrictions.customized': 'Customized',
    'restrictions.reset': 'Reset to profile defaults',
    'restrictions.blockAdultContent':
      'Block adult content',
    'restrictions.blockAdultContentHint':
      'Pornography and other content unsuitable for minors.',
    'restrictions.blockSocialMedia':
      'Block social media',
    'restrictions.blockSocialMediaHint':
      'Instagram, TikTok, Facebook, X and similar platforms.',
    'restrictions.blockGaming':
      'Block gaming platforms',
    'restrictions.blockGamingHint':
      'Online games and gaming services.',
    'restrictions.blockStreaming':
      'Block streaming services',
    'restrictions.blockStreamingHint':
      'Netflix, YouTube, Twitch and similar services.',
    'restrictions.blockAdsTrackers':
      'Block ads and trackers',
    'restrictions.blockAdsTrackersHint':
      'Ad networks and scripts that track browsing behaviour.',
    'restrictions.safeSearch':
      'Safe Search',
    'restrictions.safeSearchHint':
      'Forces Safe Search on Google and Bing results.',
    'restrictions.youtubeRestricted':
      'YouTube Restricted Mode',
    'restrictions.youtubeRestrictedHint':
      'Hides YouTube content flagged as unsuitable for younger viewers.',

    'pro.title': 'Pro panel',
    'pro.modeHome': 'Home',
    'pro.modeHospitality': 'Hospitality',
    'pro.modeAgency': 'Agency',
    'pro.backToDashboard': 'Back to Pro overview',
    'pro.capacityLabel': 'Network capacity',
    'pro.users': 'users',
    'pro.capacityUsed': '{percent}% of capacity in use.',
    'pro.nearLimitTitle':
      'You are close to the capacity limit',
    'pro.nearLimitDescription':
      'Once the limit is reached, new users will not be able to connect. Consider upgrading your capacity.',
    'pro.upgradeCapacity': 'Upgrade capacity',
    'pro.device': 'Device',
    'pro.software': 'Software',
    'pro.serialNumber': 'Serial number',
    'pro.peakLoad': 'Peak load',
    'pro.networkLoad': 'Network load',
    'pro.averageUsers': '{count} users on average',
    'pro.periodDay': 'Day',
    'pro.periodWeek': 'Week',
    'pro.periodMonth': 'Month',

    'hospitality.title': 'Guest protection',
    'hospitality.subtitle':
      'Guest network settings and welcome page.',
    'hospitality.guestProtection': 'Guest protection',
    'hospitality.autoProtectOn':
      'Guests are protected automatically',
    'hospitality.autoProtectOff':
      'Automatic protection is off',
    'hospitality.autoProtectDescription':
      'Every device that joins the network is protected by Fornect immediately. Staff does not need to do anything.',
    'hospitality.turnOn': 'Turn on automatic protection',
    'hospitality.turnOff': 'Turn off automatic protection',
    'hospitality.noParentalControl':
      'Parental control and bedtime schedules are not available in this mode because they are not relevant for guests.',
    'hospitality.connectedNow': 'Connected now',
    'hospitality.guestsToday': 'Guests today',
    'hospitality.guestsThisWeek': 'Guests this week',
    'hospitality.averageSession': 'Average session',
    'hospitality.minutes': '{minutes} min',
    'hospitality.privacyNote':
      'Statistics are aggregated. Individual guests are never identified or tracked.',
    'hospitality.splashLabel': 'Welcome page',
    'hospitality.splashTitle': 'Message for guests',
    'hospitality.splashDescription':
      'This is what a guest sees when connecting to the network for the first time.',
    'hospitality.brandName': 'Property name',
    'hospitality.headline': 'Headline',
    'hospitality.message': 'Message',
    'hospitality.splashSaved': 'Welcome page saved.',
    'hospitality.preview': 'Preview',
    'hospitality.connect': 'Connect',

    'agency.title': 'Monitoring and reports',
    'agency.subtitle':
      'Traffic overview, reports, alarms and event log.',
    'agency.monitoringLabel': 'Monitoring',
    'agency.monitoringDescription':
      'Only metadata is shown: connection counts and traffic type. Communication content is never read or stored.',
    'agency.totalConnections': '{count} connections in total',
    'agency.connections': 'connections',
    'agency.categoryWeb': 'Web traffic',
    'agency.categoryStreaming': 'Streaming',
    'agency.categorySocial': 'Social media',
    'agency.categoryAds': 'Ads and trackers',
    'agency.categoryOther': 'Other',
    'agency.reportsLabel': 'Reports',
    'agency.reportsTitle': 'Generate a report',
    'agency.reportsDescription':
      'Choose the period and format of the report to download.',
    'agency.period': 'Period',
    'agency.format': 'Format',
    'agency.generateReport': 'Generate report',
    'agency.reportQueued':
      'A {format} report has been requested. The backend will generate it once the API is ready.',
    'agency.alarmsLabel': 'Alarms',
    'agency.alarmsTitle': 'Unusual activity alerts',
    'agency.alarmsDescription':
      'An alarm triggers when traffic rises sharply above the configured threshold.',
    'agency.alarmsEnabled': 'Alarms enabled',
    'agency.spikeThreshold':
      'Traffic spike threshold: {percent}%',
    'agency.notifyByEmail': 'Notify me by email',
    'agency.logLabel': 'Event log',
    'agency.logTitle': 'Event history',
    'agency.logDescription':
      'Timestamped events, for security reporting purposes.',
    'agency.levelInfo': 'Info',
    'agency.levelWarning': 'Warning',
    'agency.levelAlert': 'Alarm',
    'agency.eventSpike':
      'Traffic rose sharply above the configured threshold.',
    'agency.eventNewDevice':
      'A new device joined the network.',
    'agency.eventBlocked':
      'Access to a domain on the risk list was blocked.',
    'agency.eventUpdate': 'A system update was installed.',
    'agency.eventNightly':
      'Nightly system check completed without errors.',
    'agency.legalNote':
      'Log scope and retention must be aligned with the legal framework before production.',

    'upgrade.title': 'Capacity upgrade',
    'upgrade.subtitle':
      'Increase the number of users your Fornect device supports.',
    'upgrade.currentLabel': 'Current plan',
    'upgrade.currentPlan': '{users} of {capacity} users',
    'upgrade.description':
      'Capacity determines how many devices can connect and be protected at the same time.',
    'upgrade.currentTier': 'Your current plan',
    'upgrade.contactSales': 'Contact sales',
    'upgrade.tierStandard':
      'Standard capacity of the Fornect Pro device.',
    'upgrade.tierExtended':
      'Extended capacity for larger properties and networks.',
    'upgrade.pricingNote':
      'Pricing and commercial terms are not defined yet. We will contact you with an offer after your request.',
    'upgrade.requestSent':
      'An upgrade request for {users} users has been recorded. We will contact you about the terms.',

    'settings.deviceLabel': 'Device',
    'settings.deviceMode': 'Device software mode',
    'settings.deviceModeDescription':
      'The mode determines which panel is shown: Home or Pro (Hospitality or Agency).',
    'settings.deviceModePocNote':
      'POC mode - in production the app reads the device type and mode from the backend at sign-in, so this would not be changed by hand.',

    'connection.label': 'Connection',
    'connection.offlineTitle': 'Fornect device is unreachable',
    'connection.offlineDescription':
      'We cannot reach the device right now. The last known state is shown, and changes will apply once the connection returns.',
    'connection.errorTitle': 'Error communicating with the device',
    'connection.errorDescription':
      'The device responded with an error. The last known state is shown.',
    'connection.lastKnown': 'Last known state: {time}',
    'connection.justNow': 'just now',
    'connection.minutesAgo': '{minutes} min ago',
    'connection.hoursAgo': '{hours} h ago',
    'connection.neverSynced': 'not synced yet',
    'connection.retry': 'Try again',
    'connection.statusOnline': 'Connected',
    'connection.statusOffline': 'Unreachable',
    'connection.statusError': 'Error',
    'connection.simulateTitle': 'Device connection state',
    'connection.simulateDescription':
      'Check how the app looks when the device is unreachable or returns an error.',
    'connection.simulatePocNote':
      'POC mode - in production the connection state comes from the backend API response, not from a manual choice.',

    'protection.platformAndroid':
      'Android phone',
    'protection.platformIos':
      'iPhone or iPad',
    'protection.platformWindows':
      'Windows',
    'protection.platformMac':
      'Mac',
    'protection.androidStep1':
      'On the device you are protecting, open this page and download the Fornect certificate.',
    'protection.androidStep2':
      'Open Settings, then Security and privacy.',
    'protection.androidStep3':
      'Find the option to install a certificate and choose the downloaded file.',
    'protection.androidStep4':
      'Confirm the name Fornect and, if the phone asks, enter your PIN or fingerprint.',
    'protection.androidStep5':
      'Come back here and confirm that the profile is installed.',
    'protection.androidFirefoxNote':
      'Firefox on Android keeps its own certificate list and does not use the system one. If you use it, the certificate must also be added inside Firefox — otherwise it stays without full protection.',
    'protection.androidNote':
      'On newer Android versions the certificate applies to the web browser, while some apps continue with standard protection.',
    'protection.iosStep1':
      'On the device you are protecting, open this page and download the Fornect profile.',
    'protection.iosStep2':
      'Open Settings - a Downloaded Profile entry appears at the top.',
    'protection.iosStep3':
      'Tap Install and enter your device passcode.',
    'protection.iosStep4':
      'Open Settings, then General, About, and turn on Fornect under certificate trust settings.',
    'protection.iosStep5':
      'Come back here and confirm that the profile is installed.',
    'protection.iosNote':
      'The trust settings step is required. Without it the iPhone will not use full protection.',
    'protection.windowsStep1':
      'Download the Fornect certificate to your computer.',
    'protection.windowsStep2':
      'Double-click the downloaded file, then choose “Install Certificate”.',
    'protection.windowsStep3':
      'Choose “Local Machine” and approve the system prompt.',
    'protection.windowsStep4':
      'Choose “Place all certificates in the following store”, select “Trusted Root Certification Authorities” and confirm.',
    'protection.windowsStep5':
      'Come back here and confirm that the profile is installed.',
    'protection.windowsNote':
      'Chrome and Edge use the system certificate list, so this is enough for them. Firefox keeps its own list and has to be handled separately, in its settings.',
    'protection.macStep1':
      'Download the Fornect certificate to your Mac.',
    'protection.macStep2':
      'Double-click the downloaded file — Keychain Access opens.',
    'protection.macStep3':
      'Choose the “System” keychain and enter your administrator password.',
    'protection.macStep4':
      'Find Fornect in the list, double-click it, open the “Trust” section and set “When using this certificate” to “Always Trust”.',
    'protection.macStep5':
      'Come back here and confirm that the profile is installed.',
    'protection.macNote':
      'Safari and Chrome use the system keychain. Firefox keeps its own list and has to be handled separately, in its settings.',
    'protection.pinningNote':
      'Some apps, such as banking apps, deliberately refuse this kind of protection. They keep standard protection - this is expected and not an error.',

    'devices.network': 'Fornect network',
    'devices.title': 'Devices',
    'devices.subtitle': 'Manage devices connected to your network.',
    'devices.online': 'Online',
    'devices.protected': 'Protected',
    'devices.unassigned': 'Unassigned',
    'devices.networkDevices': 'Network devices',
    'devices.discoveredAutomatically':
      'Devices are discovered automatically by Fornect.',
    'devices.noProfile': 'No profile assigned',
    'devices.childProfile': 'Child profile',
    'devices.teenProfile': 'Teen profile',
    'devices.adultProfile': 'Adult profile',
    'devices.adminProfile': 'Admin profile',
    'devices.fullProtection': 'Full protection',
    'devices.standardProtection': 'Standard protection',
    'devices.needsSetup': 'Needs setup',
    'devices.protectionOff': 'Protection off',
    'devices.setup': 'Set up',
    'devices.manage': 'Manage',
    'devices.emptyTitle':
      'No devices connected',
    'devices.emptyDescription':
      'No Fornect device is paired with this account yet. Pair one so Fornect can start discovering devices on your network.',
    'devices.pairDevice':
      'Pair Fornect device',

    'devices.limitReachedTitle':
      'Licence capacity exceeded',
    'devices.limitReachedDescription':
      'Your Fornect device licence covers {limit} devices. {count} are beyond it — they are not registered and get no service until a slot frees up.',
    'devices.limitReachedAction':
      'See details',

    'capacity.eyebrow': 'LICENCE',
    'capacity.title': 'Capacity is full',
    'capacity.subtitle':
      'Devices on the network: {used}. The licence covers {capacity}.',
    'capacity.whatItMeans': 'What this means',
    'capacity.explanation':
      'Your Fornect device licence covers a set number of devices. Those that appeared after that number are not registered, so Fornect gives them no service — no name resolution and no filtering. Without that they have no internet access through this network.',
    'capacity.notBlockedNote':
      'The limit is enforced when a device is registered — here, not in DNS and not in the proxy. The Fornect device additionally watches that the number of active devices stays within the licence.',
    'capacity.overflowTitle': 'Beyond the licence: {count}',
    'capacity.slot': 'Slot',
    'capacity.openDevice': 'Open device',
    'capacity.freeUpSlot': 'Free up a slot',
    'capacity.upgrade': 'Extend the licence',
    'capacity.contact': 'Contact support',
    'capacity.okTitle': 'Capacity is not full',
    'capacity.okBody':
      'There are {used} devices on the network and the licence covers {capacity}. All of them are protected.',
    'capacity.noHubTitle': 'No Fornect device paired',
    'capacity.noHubBody':
      'The licence comes with the Fornect device. Until one is paired with this account there is no limit for the panel to check.',
    'capacity.allDevices': 'All devices',
    'deviceDetails.device': 'Device',
    'deviceDetails.subtitle':
      'Manage profile, protection and internet access.',
    'deviceDetails.backToDevices': 'Back to devices',
    'deviceDetails.save': 'Save',
    'deviceDetails.cancel': 'Cancel',
    'deviceDetails.rename': 'Rename',
    'deviceDetails.unassigned': 'Unassigned',
    'deviceDetails.profile': 'Profile',
    'deviceDetails.child': 'Child',
    'deviceDetails.teen': 'Teen',
    'deviceDetails.adult': 'Adult',
    'deviceDetails.admin': 'Admin',
    'deviceDetails.profileAssigned':
      'This device uses the {profile} protection profile.',
    'deviceDetails.assignProfile':
      'Assign a profile to start managing this device.',
    'deviceDetails.changeProfile': 'Change profile',

    'deviceDetails.protection': 'Protection',
    'deviceDetails.fullProtection': 'Full Protection',
    'deviceDetails.standardProtection': 'Standard Protection',
    'deviceDetails.needsSetup': 'Needs setup',
    'deviceDetails.protectionOff': 'Protection Off',
    'deviceDetails.manageProtection':
      'Manage the protection level and Fornect Protection Profile.',
    'deviceDetails.protectionSettings': 'Protection settings',

    'deviceDetails.internetSchedule': 'Internet schedule',
    'deviceDetails.noSchedule': 'No schedule',
    'deviceDetails.perDaySchedule': 'Different per day',
    'deviceDetails.noRestrictions':
      'No automatic internet restrictions are configured.',
    'deviceDetails.followsBedtime':
      'Internet access follows the configured bedtime schedule.',
    'deviceDetails.currentStatus': 'Current status',
    'deviceDetails.editSchedule': 'Edit schedule',

    'deviceDetails.noBedtimeActive':
      'No bedtime schedule is active.',
    'deviceDetails.temporaryAccessRemaining':
      'Temporary internet access is active for {minutes} more minutes.',
    'deviceDetails.pausedByBedtime':
      'Internet for {name} is currently paused by the bedtime schedule.',
    'deviceDetails.turnsOffMinutes':
      'Internet for {name} turns off in {minutes} minutes.',
    'deviceDetails.turnsOffHours':
      'Internet for {name} turns off in {hours} h.',
    'deviceDetails.turnsOffHoursMinutes':
      'Internet for {name} turns off in {hours} h {minutes} min.',
    'deviceDetails.nextBedtime':
      'Next bedtime: {day} at {time}.',
    'deviceDetails.noUpcomingBedtime':
      'No upcoming bedtime is scheduled.',

    'deviceDetails.daySun': 'Sun',
    'deviceDetails.dayMon': 'Mon',
    'deviceDetails.dayTue': 'Tue',
    'deviceDetails.dayWed': 'Wed',
    'deviceDetails.dayThu': 'Thu',
    'deviceDetails.dayFri': 'Fri',
    'deviceDetails.daySat': 'Sat',

    'deviceDetails.internetNow': 'Internet now',
    'deviceDetails.temporarilyAllowed': 'Temporarily allowed',
    'deviceDetails.paused': 'Paused',
    'deviceDetails.allowedUntilEndToday':
      'Internet access is temporarily allowed until the end of today.',
    'deviceDetails.allowedForMinutes':
      'Internet access is temporarily allowed for {minutes} more minutes.',
    'deviceDetails.endOverride': 'End override',
    'deviceDetails.allowOutsideSchedule':
      'Temporarily allow internet access outside the schedule.',
    'deviceDetails.oneHour': '1 hour',
    'deviceDetails.untilEndOfDay': 'Until end of day',

    'deviceDetails.nameRequired':
      'Device name cannot be empty.',
    'deviceDetails.nameTooLong':
      'Device name cannot be longer than 40 characters.',

    'deviceSetup.eyebrow': 'Device setup',
    'deviceSetup.title': 'Set up new device',
    'deviceSetup.subtitle':
      'Name the device, choose a profile and select its protection level.',
    'deviceSetup.backToDevices': 'Back to devices',

    'deviceSetup.deviceName': 'Device name',
    'deviceSetup.whatDevice': 'What device is this?',
    'deviceSetup.nameHint':
      'Give it a name that will be easy to recognize later.',
    'deviceSetup.namePlaceholder': "e.g. Amina's tablet",

    'deviceSetup.profile': 'Profile',
    'deviceSetup.whoUses': 'Who uses this device?',
    'deviceSetup.chooseProfile':
      'Choose the protection profile for this device.',

    'deviceSetup.child': 'Child',
    'deviceSetup.childDescription':
      'Strict parental protection',

    'deviceSetup.teen': 'Teen',
    'deviceSetup.teenDescription':
      'Balanced parental controls',

    'deviceSetup.adult': 'Adult',
    'deviceSetup.adultDescription':
      'Standard network protection',

    'deviceSetup.admin': 'Admin',
    'deviceSetup.adminDescription':
      'Owner or trusted device',

    'deviceSetup.protection': 'Protection',
    'deviceSetup.chooseProtection':
      'Choose protection level',
    'deviceSetup.changeLater':
      'You can change this later from device settings.',

    'deviceSetup.standardProtection':
      'Standard Protection',
    'deviceSetup.standardDescription':
      'DNS filtering — around 64% of known advertising and tracking domains',

    'deviceSetup.fullProtection':
      'Full Protection',
    'deviceSetup.fullDescription':
      'With the protection profile — 70–85% of requests, but never all',

    'deviceSetup.cancel': 'Cancel',
    'deviceSetup.finish': 'Finish setup',

    'schedule.eyebrow': 'Internet schedule',
    'schedule.subtitle':
      'Choose when internet access should be paused.',
    'schedule.backToDevice': 'Back to device',
    'schedule.bedtime': 'Bedtime',
    'schedule.internetUnavailable': 'Internet unavailable',
    'schedule.from': 'From',
    'schedule.until': 'Until',
    'schedule.modeLabel': 'When the schedule applies',
    'schedule.sameEveryDay': 'Same every day',
    'schedule.perDay': 'Different per day',
    'schedule.perDayHint':
      'Set a different time for weekdays and the weekend, or for each day separately.',
    'schedule.perDaySummary':
      'A time is set for {count} days of the week.',
    'schedule.noDaysSummary':
      'No day is selected, so the schedule will not apply.',
    'schedule.dayOff': 'No schedule',

    'schedule.days': 'Days',
    'schedule.active': 'Active schedule',
    'schedule.disabled': 'Schedule disabled',
    'schedule.disabledSummary':
      'Bedtime schedule is disabled.',
    'schedule.activeSummary':
      'Internet will be paused from {start} until {end}, {days}.',
    'schedule.everyDay': 'every day',
    'schedule.mondayToFriday': 'Monday to Friday',
    'schedule.noDays': 'no days selected',
    'schedule.saved': 'Schedule saved successfully.',
    'schedule.cancel': 'Cancel',
    'schedule.save': 'Save schedule',

    'protection.eyebrow': 'Protection',
    'protection.subtitle':
      'Manage the protection level for this device.',
    'protection.backToDevice': 'Back to device',

    'protection.fornectProtection': 'Fornect protection',
    'protection.isOn': 'Protection is on',
    'protection.isOff': 'Protection is off',
    'protection.activeDescription':
      'Fornect is actively protecting this device.',
    'protection.offDescription':
      'Filtering and protection are temporarily disabled for this device.',

    'protection.today': 'Today',
    'protection.adsBlocked':
      'ads blocked on this device',

    'protection.awayTitle': 'Protection away from home',
    'protection.awayHeading':
      'Protect this device anywhere',
    'protection.awayDescription':
      'Keep Fornect protection active when this device is using mobile data, public Wi-Fi or another network.',
    'protection.awayDisabled':
      'Turn Fornect Protection on to use this feature.',

    'protection.on': 'On',
    'protection.off': 'Off',
    'protection.paused': 'Paused',

    'protection.currentProtection': 'Current protection',
    'protection.configuredProtection': 'Configured protection',
    'protection.active': 'Active',

    'protection.full': 'Full Protection',
    'protection.standard': 'Standard Protection',
    'protection.fullDescription':
      'DNS filtering plus inspection of web traffic. Stops 70–85% of advertising and tracking requests. Requires the installed protection profile.',
    'protection.coverageNote':
      'No level stops everything. Apps that bypass system inspection, QUIC/HTTP3 traffic and services with pinned certificates always let some through. The figures above come from measurements, not a promise.',
    'protection.adsBlockedNote':
      'Counts requests stopped at the DNS level — ads are not removed from the page, so part of one can stay visible. Advertising inside apps and inside video is not visible this way.',
    'protection.standardDescription':
      'Filtering at the DNS level. Stops around 64% of known advertising and tracking domains. No certificate needed.',
    'protection.levelSectionLabel': 'PROTECTION LEVEL',
    'protection.levelOff': 'Off',
    'protection.levelOffDescription':
      'Fornect does not protect this device. Traffic passes through unfiltered.',
    'protection.requiresProfile':
      'Requires an installed protection profile',
    'protection.removeProfile': 'Remove profile',
    'protection.certificatePrerequisite':
      'The protection profile is not a level of protection but a prerequisite for Full Protection. While it is installed, you can freely choose between Standard and Full.',
    'protection.levelHint':
      'Switching from Full to Standard does not remove the protection profile — you can turn Full Protection back on without reinstalling.',
    'protection.pairedStandardChosen':
      'The protection profile is installed, but this device is currently using Standard Protection. You can switch back to Full at any time, without reinstalling.',

    'protection.certificatePairing':
      'Protection profile pairing',

    'protection.profileInstalled':
      'Protection profile installed',
    'protection.pairedEnabled':
      'This device is paired with Fornect and advanced protection is enabled.',
    'protection.pairedPaused':
      'The protection profile remains installed. Protection is currently paused and will return to Full Protection when you turn it back on.',
    'protection.paired': 'Paired',
    'protection.certificateVerified':
      'Protection profile status verified.',
    'protection.reinstallProfile':
      'Reinstall protection profile',

    'protection.fullNotEnabled':
      'Full Protection is not enabled',
    'protection.pairToEnable':
      'Pair this device with Fornect to enable advanced protection.',
    'protection.startPairing': 'Start pairing',

    'protection.installProfile':
      'Install Fornect Protection Profile',
    'protection.installInstructions':
      'Follow the installation steps on this device, then confirm when the protection profile has been installed.',
    'protection.waitingConfirmation':
      'Waiting for confirmation',
    'protection.pairingInProgress':
      'Pairing is currently in progress.',
    'protection.installationFailed':
      'Installation failed',
    'protection.profileInstalledButton':
      'Profile installed',

    'protection.pairingFailed':
      'Pairing failed',
    'protection.couldNotVerify':
      'Fornect could not verify the protection profile on this device.',
    'protection.notVerified':
      'Protection profile not verified',
    'protection.tryInstallationAgain':
      'Please try the installation again.',
    'protection.tryAgain': 'Try again',

    'notifications.title': 'Notifications',
    'notifications.subtitle':
      'Important updates about your devices and protection.',
    'notifications.inbox': 'Inbox',
    'notifications.markAll': 'Mark all as read',
    'notifications.markRead': 'Mark as read',

    'notifications.justNow': 'just now',
    'notifications.minutesAgo': '{minutes} min ago',
    'notifications.todayAt': 'today at {time}',
    'notifications.yesterdayAt': 'yesterday at {time}',
    'notifications.onDateAt': '{date} at {time}',

    'notifications.emptyTitle': 'No notifications',
    'notifications.emptyMessage':
      'They will show up here when something happens — for example when a device leaves the network during bedtime.',

    'notifications.capacityReached':
      'Capacity limit reached',
    'notifications.capacityMessage':
      'Your Fornect device supports up to {capacity} devices. New devices cannot be added until one is removed.',
    'notifications.newDeviceTitle': 'New device on the network',
    'notifications.newDeviceMessage':
      'The device “{name}” ({mac}) appeared on the network and is waiting for your decision. Until then it has basic protection.',
    'notifications.consentFailedTitle': 'Full protection is not on',
    'notifications.consentFailedMessage':
      'On “{name}” consent was given, but the certificate installation did not go through. The device stayed on basic protection.',
    'notifications.reconsentTitle': 'Consent needs renewing',
    'notifications.reconsentMessage':
      'The policy has changed (version {version}). Devices with consent given under the earlier terms ({count}): {names}. To keep full protection in effect on them, the policy needs to be accepted again.',

    'portalBranding.eyebrow': 'NETWORK',
    'portalBranding.title': 'Portal text and branding',
    'portalBranding.subtitle':
      'This is what devices see when they first join your network.',
    'portalBranding.backToSettings': 'Back to settings',
    'portalBranding.loading': 'Loading…',
    'fleet.eyebrow': 'FLEET',
    'fleet.title': 'Device updates',
    'fleet.subtitle':
      'When devices update, in what order, and which filter lists they use.',
    'fleet.backToSettings': 'Back to settings',
    'fleet.loading': 'Loading…',
    'fleet.saved': 'Saved.',
    'fleet.saveFailed': 'Saving failed. Please try again.',
    'fleet.loadFailed': 'Fleet data could not be loaded.',
    'fleet.online': 'Online',
    'fleet.offline': 'Offline',
    'fleet.pausedBadge': 'Updates paused',
    'fleet.noHubTitle': 'No paired device',
    'fleet.noHubBody':
      'Updates are configured per Fornect device. Pair one and it will appear here.',
    'fleet.versionsTitle': 'Versions on the device',
    'fleet.versionsPending':
      'The device does not report versions yet. They will appear as soon as it sends them in a heartbeat — until then there is nothing to write here, and an invented version would be worse than none.',
    'fleet.ringTitle': 'Rollout ring',
    'fleet.ringHint':
      'A new version goes to the bench first, then to a small share of devices, then to all. A bad update is stopped before it reaches everyone.',
    'fleet.ring.bench': 'Bench',
    'fleet.ring.early': 'First 5%',
    'fleet.ring.half': 'Half',
    'fleet.ring.all': 'All',
    'fleet.windowTitle': 'Maintenance window',
    'fleet.windowHint':
      'The device updates only within this range, in your account’s local time. The window may cross midnight.',
    'fleet.windowStart': 'From',
    'fleet.windowEnd': 'To',
    'fleet.killTitle': 'Stopping updates',
    'fleet.killHintRunning': 'The device accepts new updates during the maintenance window.',
    'fleet.killHintPaused':
      'The device accepts no new updates. What is already installed stays as it is.',
    'fleet.pause': 'Pause updates',
    'fleet.resume': 'Resume updates',
    'fleet.listsTitle': 'Filter lists',
    'fleet.listUnnamed': 'Unlabelled set',
    'fleet.listCount': '{count} lists',
    'fleet.listNone':
      'The panel has no list set for this device, so the device uses its built-in one.',
    'fleet.listFromRollback': 'This is a restored earlier set.',
    'fleet.listLabel': 'Set label',
    'fleet.listUrls': 'List addresses, one per line',
    'fleet.listUrlsHint':
      'https only. A list fetched over plain http is a list someone on the path can replace — and it decides what is NOT blocked, too.',
    'fleet.editLists': 'Edit lists',
    'fleet.rollback': 'Restore previous set',
    'fleet.rollbackUnavailable': 'There is no earlier set to restore.',
    'fleet.directSourceWarning':
      'These addresses are fetched straight from the source. That works for a few devices; a fleet goes through our mirror, because a direct source rate-limits and leaves devices without a refreshed list.',
    'fleet.configDelivered': 'The device has confirmed these settings (version {version}).',
    'fleet.configPending':
      'Settings are saved (version {version}), but the device has not confirmed them yet.',
    'fleet.configNone':
      'No configuration has been written for this device yet, so there is nothing to arrive.',
    'fleet.missingTitle': 'What is deliberately not here',
    'fleet.missingBody':
      'A fleet health view — block rate, proxy errors and boot attempts — is not here because the device does not send that data yet. A screen drawing it would show zeros indistinguishable from real zeros, and someone would make a decision on that number.',
    'portalBranding.previewTitle': 'How it will look',
    'portalBranding.previewHint':
      'Only what you change here is shown — the header, title and message. The rest of the portal (the protection choice, the certificate instructions) is the same for everyone and does not change.',
    'portalBranding.brandSection': 'Branding',
    'portalBranding.brandName': 'Name shown at the top',
    'portalBranding.accentColor': 'Accent colour',
    'portalBranding.textSection': 'Welcome text',
    'portalBranding.textHint':
      'The portal speaks the guest’s language, not yours — so the text is entered in both.',
    'portalBranding.titleBs': 'Title (Bosnian)',
    'portalBranding.messageBs': 'Message (Bosnian)',
    'portalBranding.titleEn': 'Title (English)',
    'portalBranding.messageEn': 'Message (English)',
    'portalBranding.privacyUrl': 'Link to the privacy policy',
    'portalBranding.privacyUrlHint':
      'Shown next to the consent form on the portal. GDPR requires the policy to be available at the moment consent is given — consent without sight of what happens to the data is not informed consent. Leave empty to show nothing.',
    'portalBranding.supportContact': 'Contact in the footer',
    'portalBranding.supportHint':
      'Leave empty to show no contact.',
    'portalBranding.lockedTitle': 'What cannot be changed here',
    'portalBranding.lockedBody':
      'The protection coverage figures, their limits and the certificate instructions are not configurable. Those are claims Fornect answers for, so they have to be the same everywhere and verifiable.',
    'portalBranding.savedWithVersion':
      'Saved. Devices will pick up version {version}.',

    'newDevices.eyebrow': 'NETWORK',
    'newDevices.title': 'New devices',
    'newDevices.subtitle':
      'Devices you have not classified yet.',
    'newDevices.hint':
      'These devices appeared on your network and nobody has decided what protection they get. Until then they run with basic protection.',
    'newDevices.firstSeen': 'First seen',
    'newDevices.basicProtection': 'Basic protection',
    'newDevices.fullProtection': 'Full protection',
    'newDevices.autoGuestNote':
      'Devices without a screen — a TV, a printer, a console — will never answer for themselves. So a device still unclassified after 24 hours is placed among guests, with basic protection.',
    'newDevices.emptyTitle': 'No new devices',
    'newDevices.emptyBody':
      'Every device on your network is classified. When an unknown one shows up, it will be waiting here.',
    'newDevices.allDevices': 'All devices',
    'newDevices.bannerTitle': 'New devices need a decision',
    'newDevices.bannerBody':
      'Take a look — one of them may be a device you do not recognise.',

    'notifications.deviceLeftNetwork':
      'Device is not on the network',
    'notifications.deviceLeftNetworkMessage':
      '{device} is no longer visible on your network. Fornect cannot protect it until it returns.',
    'notifications.leftDuringSchedule':
      'Device left the network during bedtime',
    'notifications.leftDuringScheduleMessage':
      '{device} disconnected from the network while bedtime was active. Check whether it is using mobile data.',

    'offlineAlert.label': 'NOTIFICATIONS',
    'offlineAlert.title': 'Presence tracking',
    'offlineAlert.toggle':
      'Notify me when this device is off the network',
    'offlineAlert.hint':
      'On by default for Child and Teen profiles.',
    'offlineAlert.limitation':
      'Fornect only sees that a device is off the network. It cannot tell deliberate shutdown from an empty battery or leaving the house. If the device switches to mobile data, Fornect cannot see it — turn on protection away from home for that.',

    'login.tagline': 'Network protection made simple.',
    'login.welcome': 'Welcome back',
    'login.subtitle':
      'Sign in to manage your Fornect network.',
    'login.email': 'Email address',
    'login.password': 'Password',
    'login.passwordPlaceholder': 'Enter your password',
    'login.rememberMe': 'Remember me',
    'login.forgotPassword': 'Forgot password?',
    'login.invalidCredentials':
      'Invalid email or password.',
    'login.signIn': 'Sign in',
    'login.newToFornect': 'New to Fornect?',
    'login.createAccount': 'Create account',
    'login.platform': 'Fornect protection platform',

    'register.title': 'Create your account',
    'register.subtitle':
      'Create your Fornect account to start setting up your protection device.',
    'register.fullName': 'Full name',
    'register.namePlaceholder': 'Your name',
    'register.email': 'Email address',
    'register.password': 'Password',
    'register.passwordPlaceholder': 'At least 8 characters',
    'register.confirmPassword': 'Confirm password',
    'register.confirmPlaceholder': 'Repeat your password',
    'register.createAccount': 'Create account',
    'register.alreadyHaveAccount': 'Already have an account?',
    'register.signIn': 'Sign in',

    'register.enterName': 'Enter your name.',
    'register.invalidEmail':
      'Enter a valid email address.',
    'register.passwordMin':
      'Password must contain at least 8 characters.',
    'register.passwordMismatch':
      'Passwords do not match.',
    'register.emailExists':
      'An account with this email already exists.',
    'register.unable':
      'Unable to create account.',

    'verify.checkEmail': 'Check your email',
    'verify.sentCode':
      'We sent a 6-digit verification code to',
    'verify.yourEmail': 'your email address',
    'verify.code': 'Verification code',
    'verify.pocCode': 'POC verification code:',
    'verify.enterCode': 'Enter the code from the email.',
    'verify.resendFailed':
      'Sending a new code failed. Try again in a moment.',
    'verify.invalidCode':
      'Invalid verification code.',
    'verify.codeSent':
      'A new verification code has been sent.',
    'verify.verifyEmail': 'Verify email',
    'verify.resend':
      "Didn't receive a code? Resend",
    'verify.changeEmail':
      '← Change email address',

    'verify.verified': 'Email verified',
    'verify.accountVerified':
      'Your account is verified',
    'verify.verifiedDescription':
      'Your email address has been successfully verified. Next, connect your physical Fornect device to this account.',
    'verify.nextStep': 'Next step',
    'verify.connectDevice':
      'Connect your Fornect device',
    'verify.connectDescription':
      'Pair your physical Fornect Home or Pro device using its QR code or serial number.',
    'verify.pairDevice': 'Pair device →',

    'pair.tagline': 'Connect your protection device.',
    'pair.deviceSetup': 'Device setup',
    'pair.title': 'Pair your Fornect device',
    'pair.intro':
      'Connect this account to your physical Fornect device. Enter the 6-digit code shown on the device.',

    'pair.scanQr': 'Scan QR code',
    'pair.scanQrDescription':
      'Use the code shown on your Fornect device.',
    'pair.serialNumber': 'Pairing code',
    'pair.serialDescription':
      'Enter the 6-digit code manually.',

    'pair.scanDeviceQr':
      'Scan device QR code',
    'pair.realCameraDescription':
      'In the real app this will open the camera and scan the QR code from the physical Fornect device.',
    'pair.simulateQr': 'Scan QR code',
    'pair.pocCamera':
      'POC mode — camera scanning will be connected later. Enter the code manually.',
    'pair.qrNotAvailable':
      'Camera scanning isn\'t connected yet — enter the code manually.',

    'pair.deviceSerial': 'Pairing code',
    'pair.invalidSerial':
      'The code is wrong, expired, or the device is already paired. Request a new code on the device.',
    'pair.pairDevice': 'Pair device',
    'pair.cancel':
      'Cancel and return to sign in',

    'pair.paired': 'Device paired',
    'pair.connected':
      '{name} is connected',
    'pair.successDescription':
      'Your Fornect device has been successfully paired with this account.',
    'pair.device': 'Device',
    'pair.mode': 'Mode',
    'pair.continueDashboard':
      'Continue to dashboard',

    'forgot.title': 'Forgot your password?',
    'forgot.subtitle':
      'Enter your email address and we will send you instructions to reset your password.',
    'forgot.email': 'Email address',
    'forgot.invalidEmail':
      'Enter a valid email address.',
    'forgot.sendResetLink':
      'Send reset link',
    'forgot.backToSignIn':
      '← Back to sign in',
    'forgot.backToSignInButton':
      'Back to sign in',
    'forgot.checkEmail':
      'Check your email',
    'forgot.ifAccountExists':
      'If an account exists for',
    'forgot.instructionsSent':
      'password reset instructions have been sent.',

    'schedule.daySun': 'Sun',
    'schedule.dayMon': 'Mon',
    'schedule.dayTue': 'Tue',
    'schedule.dayWed': 'Wed',
    'schedule.dayThu': 'Thu',
    'schedule.dayFri': 'Fri',
    'schedule.daySat': 'Sat',

    'schedules.title': 'Schedules',
    'schedules.dashboard': 'Dashboard',
    'schedules.deviceRoutines': 'Device routines',
    'schedules.heroDescription':
      'Set healthy online hours and automatically pause internet access when it is time to disconnect.',
    'schedules.automaticControl': 'Automatic control',
    'schedules.devices': 'Devices',
    'schedules.activeSchedules': 'Active schedules',
    'schedules.disabled': 'Disabled',
    'schedules.bedtimeControl': 'Bedtime control',
    'schedules.deviceSchedules': 'Device schedules',
    'schedules.bedtime': 'Bedtime',
    'schedules.active': 'Active',
    'schedules.notScheduled': 'Not scheduled',
    'schedules.perDay': 'Different per day',
    'schedules.scheduleDisabled': 'Schedule disabled',
    'schedules.everyDay': 'Every day',
    'schedules.mondayFriday': 'Monday – Friday',
    'schedules.editSchedule': 'Edit schedule',
    'schedules.noDevices': 'No devices yet',
    'schedules.addDevice':
      'Add a device before creating a schedule.',

    'protectionOverview.title': 'Protection',
    'protectionOverview.dashboard': 'Dashboard',
    'protectionOverview.networkSecurity': 'Network security',
    'protectionOverview.description':
      'Review how every device is protected and manage certificate pairing for full Fornect protection.',
    'protectionOverview.active': 'Protection active',
    'protectionOverview.full': 'Full Protection',
    'protectionOverview.standard': 'Standard Protection',
    'protectionOverview.needsSetup': 'Needs setup',
    'protectionOverview.off': 'Protection Off',
    'protectionOverview.protectedDevices': 'Protected devices',
    'protectionOverview.deviceProtection': 'Device protection',
    'protectionOverview.protection': 'Protection',
    'protectionOverview.certificate': 'Certificate',
    'protectionOverview.fullDescription':
      'Firewall + DNS + certificate',
    'protectionOverview.standardDescription':
      'DNS and network protection',
    'protectionOverview.setupDescription':
      'Configuration required',
    'protectionOverview.offDescription':
      'Protection is currently turned off',
    'protectionOverview.paired': 'Paired',
    'protectionOverview.pairing': 'Pairing',
    'protectionOverview.pairingFailed':
      'Pairing failed',
    'protectionOverview.notPaired': 'Not paired',
    'protectionOverview.manage': 'Manage protection',
    'protectionOverview.noDevices': 'No devices yet',
    'protectionOverview.addDevice':
      'Add a device before configuring protection.',

    'help.title': 'Help & Support',
    'help.subtitle':
      'Find answers or send a support request.',
    'help.backToSettings': '← Back to settings',
    'help.faqLabel': 'Frequently asked questions',
    'help.faqTitle': 'How can we help?',
    'help.faqDescription':
      'Common questions about Fornect Home devices and protection.',

    'help.deviceOfflineQuestion':
      'What should I do if a device is offline?',
    'help.deviceOfflineAnswer':
      'Check that the device is powered on and connected to your home network. Fornect shows the last known state until the device reconnects.',

    'help.profilesQuestion':
      'How do Child, Teen, Adult and Admin profiles work?',
    'help.profilesAnswer':
      'A profile determines the restriction level for a device. Child and Teen use stricter rules, while Adult and Admin allow broader access.',

    'help.scheduleQuestion':
      'How does the bedtime schedule work?',
    'help.scheduleAnswer':
      'A schedule automatically pauses internet access during the selected time period and days.',

    'help.protectionQuestion':
      'What is the difference between Standard and Full Protection?',
    'help.protectionAnswer':
      'Standard protection filters at the DNS level and stops around 64% of known advertising and tracking domains. Full protection, with the profile installed, also inspects web traffic and reaches 70–85% of requests. No level stops everything: apps that bypass system inspection, QUIC/HTTP3 traffic and services with pinned certificates always let some through.',

    'help.pairingQuestion':
      'What does protection profile pairing mean?',
    'help.pairingAnswer':
      'Pairing connects the device with the Fornect protection profile to enable Full Protection features.',

    'help.overrideQuestion':
      'Can I temporarily allow internet outside the schedule?',
    'help.overrideAnswer':
      'Yes. Emergency Override can temporarily allow internet for 15 or 30 minutes, one hour, or until the end of the day.',

    'help.supportLabel': 'Support',
    'help.contactSupport': 'Contact support',
    'help.supportDescription':
      'Describe the problem so Fornect support can review your request.',
    'help.category': 'Category',
    'help.categoryGeneral': 'General',
    'help.categoryDevice': 'Device',
    'help.categoryProtection': 'Protection',
    'help.categorySchedule': 'Schedule',
    'help.categoryAccount': 'Account',
    'help.message': 'Message',
    'help.messagePlaceholder':
      'Describe your problem or question...',
    'help.messageTooShort':
      'Please enter at least 10 characters.',
    'help.sendRequest': 'Send request',
    'help.requestReceived':
      'Your support request has been received.',
    'help.pocNote':
      'POC mode — support submission will be connected to the backend service later.',
    'protectionOverview.childProfile': 'Child profile',
    'protectionOverview.teenProfile': 'Teen profile',
    'protectionOverview.adultProfile': 'Adult profile',
    'protectionOverview.adminProfile': 'Admin profile',
    'protectionOverview.unassigned': 'Unassigned profile',

    'settings.title': 'Account settings',
    'settings.subtitle':
      'Manage your account and notification preferences.',
    'settings.account': 'Account',
    'settings.yourAccount': 'Your account',
    'settings.name': 'Name',
    'settings.email': 'Email',
    'settings.language': 'Language',
    'settings.interfaceLanguage': 'Interface language',
    'settings.bosnianPrimary':
      'Bosnian is the primary Fornect language.',
    'settings.bosnian': 'Bosanski',
    'settings.primaryLanguage': 'Primary language',
    'settings.english': 'English',
    'settings.optionalLanguage': 'Optional language',
    'settings.emailPreferences': 'Email preferences',
    'settings.emailNotifications': 'Email notifications',
    'settings.chooseEmails':
      'Choose which important Fornect events should also be sent by email.',
    'settings.deviceOffline': 'Device offline',
    'settings.deviceOfflineDescription':
      'Email me when my Fornect device goes offline.',
    'settings.protectionAlerts': 'Protection alerts',
    'settings.protectionAlertsDescription':
      'Receive important protection and security alerts.',
    'settings.softwareUpdates': 'Software updates',
    'settings.softwareUpdatesDescription':
      'Notify me when a Fornect update is available.',
    'settings.savePreferences': 'Save preferences',
    'settings.security': 'Security',
    'settings.changePassword': 'Change password',
    'settings.currentPassword': 'Current password',
    'settings.newPassword': 'New password',
    'settings.confirmPassword': 'Confirm new password',
    'settings.fornectUser': 'Fornect user',
    'settings.demoNotice':
      'You are using the Fornect demo account. Its password is fixed in this POC.',
    'settings.demoPasswordFixed':
      'The demo account password cannot be changed in this POC.',
    'settings.enterCurrentPassword':
      'Enter your current password.',
    'settings.passwordMin':
      'New password must contain at least 8 characters.',
    'settings.passwordMismatch':
      'New passwords do not match.',
    'settings.passwordBackendReady':
      'Password change is ready for backend integration.',

    'protectionOverview.guest': 'Basic protection',
    'consent.formTitle': 'Consent to full protection',
    'consent.formIntro':
      'Full protection means the Fornect device inspects the encrypted (HTTPS) traffic of this device. That requires explicit consent, which is recorded.',
    'consent.guardianName': 'Full name of the person giving consent',
    'consent.guardianRelation': 'Relationship to the device user',
    'consent.relationPlaceholder':
      'e.g. parent, guardian, device owner',
    'consent.isMinor': 'This device is used by a minor',
    'consent.acceptPolicy':
      'I have read and accept the traffic inspection policy',
    'consent.scopeNote':
      'Consent applies to this device only and can be withdrawn at any time.',
    'consent.cancel': 'Cancel',
    'consent.submit': 'Give consent',
    'consent.errorFields':
      'Enter the name and the relationship to the device user.',
    'consent.errorPolicy':
      'You must accept the policy to continue.',
    'consent.errorServer':
      'The action failed. Check your connection and try again.',
    'consent.failedByUser':
      'The user reported that installation did not succeed.',
    'consent.reacceptTitle': 'The policy has changed',
    'consent.reacceptBody':
      'The terms the consent was given under have since changed. To keep full protection in effect, the policy needs to be accepted again.',
    'consent.reacceptButton': 'Review and accept',
    'consent.recordLabel': 'CONSENT RECORD',
    'consent.grantedAt': 'Given',
    'consent.policyVersion': 'Policy version',
    'consent.proof': 'Confirmation',
    'consent.proofManual':
      'Confirmed manually (not technically verified)',
    'consent.proofVerified': 'Technically verified on the device',
    'consent.minorNote':
      'It is recorded that the device is used by a minor and that a guardian gave consent.',
    'consent.revoke': 'Withdraw consent',
    'consent.guestNote':
      'This device currently uses basic protection. Consent was withdrawn earlier, or never given.',
    'consent.startWithConsent': 'Continue with consent',
    'consent.removeCertTitle':
      'Remove the certificate from the device',
    'consent.removeCertBody':
      'Inspection has stopped, but the Fornect certificate is still installed on the device and that device still trusts it. Remove it:',
    'consent.removeCertAndroid':
      'Android: Settings → Security → Certificates → delete Fornect (and separately in Firefox, if you use it).',
    'consent.removeCertIos':
      'iPhone and iPad: Settings → General → VPN & Device Management → remove the Fornect profile.',
    'consent.removeCertDesktop':
      'Computer: open certificate management and delete Fornect from trusted authorities, and from the browser itself if it keeps its own list.',
    'consent.downloadCertificate': 'Download certificate',
    'consent.fingerprintLabel': 'CERTIFICATE FINGERPRINT',
    'consent.fingerprintHint':
      'Compare this fingerprint with the one shown on the device during installation. If they differ, stop the installation.',
    'consent.fingerprintPending':
      'The fingerprint will appear once the Fornect device is connected — until then there is nothing to compare against.',
    'consent.verificationPending':
      'Once the Fornect device is connected, installation is verified automatically. Until then confirm manually — such a confirmation is recorded as unverified.',
    'consent.consentStillValid':
      'Consent remains valid — only the certificate installation is repeated.'
  }
};

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly authService = inject(AuthService);

  readonly currentLanguage =
    signal<AppLanguage>(this.loadLanguage());

  setLanguage(language: AppLanguage): void {
    this.currentLanguage.set(language);

    const accountId =
      this.authService.currentUser()?.accountId ?? 'anonymous';

    const key =
      `fornect-account-preferences-${accountId}`;

    let preferences: Record<string, unknown> = {};

    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        preferences = JSON.parse(saved);
      } catch {
        preferences = {};
      }
    }

    localStorage.setItem(
      key,
      JSON.stringify({
        ...preferences,
        language
      })
    );
  }

  t(
    key: string,
    params?: Record<string, string | number>
  ): string {
    let text =
      translations[this.currentLanguage()][key] ?? key;

    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(
          `{${name}}`,
          String(value)
        );
      }
    }

    return text;
  }

  syncWithCurrentAccount(): void {
    this.currentLanguage.set(
      this.loadLanguage()
    );
  }

  private loadLanguage(): AppLanguage {
    const accountId =
      this.authService.currentUser()?.accountId ?? 'anonymous';

    const saved = localStorage.getItem(
      `fornect-account-preferences-${accountId}`
    );

    if (!saved) {
      return 'bs';
    }

    try {
      const preferences = JSON.parse(saved);

      return preferences.language === 'en'
        ? 'en'
        : 'bs';
    } catch {
      return 'bs';
    }
  }
}



















