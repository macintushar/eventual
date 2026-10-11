import { Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from 'eventual';

export const GroupSummary = () => (
  <Card style={{ width: 360 }}>
    <CardHeader>
      <CardTitle>Goa trip</CardTitle>
      <CardDescription>4 members · last expense 2 days ago</CardDescription>
      <CardAction><Button variant="outline" size="sm">Open</Button></CardAction>
    </CardHeader>
    <CardContent>
      <div style={{ fontSize: 14 }}>You are owed <strong>₹3,420.00</strong> across 6 expenses.</div>
    </CardContent>
    <CardFooter style={{ gap: 8 }}>
      <Button size="sm">Settle up</Button>
      <Button size="sm" variant="ghost">Remind</Button>
    </CardFooter>
  </Card>
);

export const Simple = () => (
  <Card style={{ width: 360 }}>
    <CardHeader>
      <CardTitle>Flat 402 rent</CardTitle>
      <CardDescription>Split equally between 3 people</CardDescription>
    </CardHeader>
  </Card>
);
