import { requireSession } from '@/lib/auth';
import { getStore } from '@/store';
import { PageHeader } from '@/components/ui';
import { PlaybookManager } from './playbook-manager';

export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  await requireSession();
  const playbooks = await getStore().listPlaybooks();

  return (
    <>
      <PageHeader
        title="Sector playbooks"
        description="The sector website-importance score is a judgement about a market, not a per-company opinion — so it lives here, versioned and approved, rather than being re-invented by the model on every row. A playbook proposed by AI stays unapproved and has no effect on scoring until a human approves it."
      />
      <PlaybookManager playbooks={playbooks} />
    </>
  );
}
