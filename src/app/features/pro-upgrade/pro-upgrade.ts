import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HubService } from '../../core/services/hub';
import { TranslatePipe } from '../../shared/pipes/translate';

interface CapacityTier {
  users: number;
  descriptionKey: string;
}

@Component({
  selector: 'app-pro-upgrade',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './pro-upgrade.html',
  styleUrl: './pro-upgrade.scss'
})
export class ProUpgrade {
  private readonly hubService = inject(HubService);

  // Kapaciteti dolaze iz specifikacije: 100 je primjer iz
  // Pro dashboard-a, 500 je ciljni kapacitet za koji se
  // bira hardver. Cijene se namjerno ne prikazuju dok
  // komercijalni uslovi ne budu potvrđeni.
  readonly tiers: CapacityTier[] = [
    { users: 100, descriptionKey: 'upgrade.tierStandard' },
    { users: 500, descriptionKey: 'upgrade.tierExtended' }
  ];

  /** Paket za koji je korisnik pitao; ništa se nigdje ne šalje. */
  selectedTier: CapacityTier | null = null;

  get currentCapacity(): number {
    return this.hubService.hub().capacity;
  }

  get connectedUsers(): number {
    return this.hubService.hub().connectedUsers;
  }

  isCurrent(tier: CapacityTier): boolean {
    return tier.users === this.currentCapacity;
  }

  /**
   * Zahtjev za nadogradnju nema kamo otići: backend za to ne postoji.
   * Ranije je ekran pisao da je zahtjev "zabilježen"; sada kaže da
   * se korisnik javi Fornect timu direktno.
   */
  requestUpgrade(tier: CapacityTier): void {
    this.selectedTier = tier;
  }
}
