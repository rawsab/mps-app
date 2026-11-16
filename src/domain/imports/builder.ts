import type {
  Disposition,
  ImportIssue,
  IssueCode,
  RawValue,
  SourceItem,
  SourceItemRole,
  SourceLocation,
} from './contract';

/**
 * Accumulates source items and issues while a profile walks a file. Every registered item starts
 * unclaimed; `finish` turns anything still unclaimed into an UNRECOGNIZED_CONTENT issue, so content
 * can never be silently dropped (FR-13).
 */
export class ImportAccumulator {
  private items = new Map<string, SourceItem & { claimed: boolean }>();
  private order: string[] = [];
  readonly issues: ImportIssue[] = [];

  register(id: string, location: SourceLocation, raw: RawValue, displayText: string | null = null): string {
    if (!this.items.has(id)) {
      this.items.set(id, {
        id,
        location,
        raw,
        displayText,
        role: 'unknown',
        disposition: { status: 'unresolved', issueIds: ['pending'] },
        claimed: false,
      });
      this.order.push(id);
    }
    return id;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  isClaimed(id: string): boolean {
    return this.items.get(id)?.claimed ?? false;
  }

  private claim(id: string, role: SourceItemRole, disposition: Disposition) {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown source item ${id}`);
    item.role = role;
    item.disposition = disposition;
    item.claimed = true;
  }

  map(id: string, role: SourceItemRole, ...targets: string[]) {
    this.claim(id, role, { status: 'mapped', targets: targets.length ? targets : [role], decidedBy: 'profile_rule' });
  }

  exclude(id: string, role: SourceItemRole, reason: string) {
    this.claim(id, role, { status: 'excluded', reason, decidedBy: 'profile_rule' });
  }

  /** Raises an issue. Blocking issues also mark their items unresolved. */
  issue(code: IssueCode, severity: ImportIssue['severity'], message: string, sourceItemIds: string[], proposal: string | null = null): string {
    const id = `issue-${this.issues.length + 1}`;
    this.issues.push({ id, code, severity, message, sourceItemIds, proposal });
    if (severity === 'blocking') {
      for (const itemId of sourceItemIds) {
        const item = this.items.get(itemId);
        if (!item) continue;
        const existing = item.disposition.status === 'unresolved' && item.claimed ? item.disposition.issueIds : [];
        this.claim(itemId, item.role === 'unknown' ? 'unknown' : item.role, { status: 'unresolved', issueIds: [...existing, id] });
      }
    }
    return id;
  }

  /** Marks an item with a role while leaving it unresolved under an existing blocking issue. */
  setRole(id: string, role: SourceItemRole) {
    const item = this.items.get(id);
    if (item) item.role = role;
  }

  finish(): SourceItem[] {
    const leftovers = this.order.filter((id) => !this.items.get(id)!.claimed);
    if (leftovers.length) {
      this.issue(
        'UNRECOGNIZED_CONTENT',
        'blocking',
        `${leftovers.length} source item(s) were not recognized by this template profile. Map each one or exclude it with a reason.`,
        leftovers,
      );
    }
    return this.order.map((id) => {
      const { claimed: _claimed, ...item } = this.items.get(id)!;
      return item;
    });
  }
}
