import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updatePollAction } from '@/lib/actions';
import type { Poll } from '@/lib/types';

interface EditPollFormProps {
  poll: Pick<Poll, 'id' | 'title' | 'description'>;
}

export default function EditPollForm({ poll }: EditPollFormProps) {
  return (
    <form action={updatePollAction} id="edit-poll-form" className="space-y-4">
      <input type="hidden" name="id" value={poll.id} />
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium">Title</label>
        <Input id="title" name="title" defaultValue={poll.title} required />
      </div>
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <Textarea id="description" name="description" defaultValue={poll.description ?? ''} />
      </div>
    </form>
  );
}