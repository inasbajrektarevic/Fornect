import { Component, input, output } from '@angular/core';

import {
  TranslatePipe
} from '../../../shared/pipes/translate';

/**
 * Kartica "zaštita van kuće".
 *
 * Izdvojena iz ekrana zaštite jer je taj stil prelazio Angularov
 * budžet za stil komponente (8 kB). Budžet nije kozmetika: on javlja
 * da komponenta radi previše. Ekran zaštite je držao šest odvojenih
 * cjelina — nivoe, uparivanje, uputstvo za certifikat, pristanak,
 * statistiku i ovu karticu — pa je ovo prvi i najčistiji rez: kartica
 * ne dijeli stanje ni sa čim, samo prima dvije vrijednosti i javlja
 * jedan klik.
 *
 * Odluka o tome šta klik radi ostaje u roditelju: on zna uređaj i
 * pravilo da se prekidač ne smije pomjeriti dok je zaštita ugašena.
 */
@Component({
  selector: 'app-away-card',
  imports: [
    TranslatePipe
  ],
  templateUrl: './away-card.html',
  styleUrl: './away-card.scss'
})
export class AwayCard {
  /** Da li je zaštita van kuće uključena za ovaj uređaj. */
  readonly enabled = input.required<boolean>();

  /** Da li je zaštita uopšte uključena — ako nije, prekidač stoji. */
  readonly protectionEnabled = input.required<boolean>();

  readonly toggled = output<void>();
}
