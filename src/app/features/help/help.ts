import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  TranslatePipe
} from '../../shared/pipes/translate';

/**
 * Pomoć i podrška.
 *
 * Forma za slanje zahtjeva podršci je uklonjena: nije slala ništa, a
 * korisniku je pisala da je zahtjev zaprimljen. Dok backend za podršku
 * ne postoji, ekran to kaže otvoreno.
 */
@Component({
  selector: 'app-help',
  imports: [
    RouterLink,
    TranslatePipe
  ],
  templateUrl: './help.html',
  styleUrl: './help.scss'
})
export class Help {}
