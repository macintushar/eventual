import { Button, EmptyState } from 'eventual';
import { Receipt } from 'lucide-react';
export const NoExpenses = () => (
  <EmptyState icon={Receipt} title="No expenses yet" description="Add the first one and Eventual works out who owes what." action={<Button>Add expense</Button>} />
);
