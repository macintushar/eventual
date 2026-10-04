import { Tabs, TabsContent, TabsList, TabsTrigger } from 'eventual';
export const GroupTabs = () => (
  <Tabs defaultValue="expenses" style={{ width: 380 }}>
    <TabsList>
      <TabsTrigger value="expenses">Expenses</TabsTrigger>
      <TabsTrigger value="balances">Balances</TabsTrigger>
      <TabsTrigger value="members">Members</TabsTrigger>
    </TabsList>
    <TabsContent value="expenses"><p style={{ fontSize: 14, marginTop: 12 }}>6 expenses this month.</p></TabsContent>
    <TabsContent value="balances">Balances</TabsContent>
    <TabsContent value="members">Members</TabsContent>
  </Tabs>
);
