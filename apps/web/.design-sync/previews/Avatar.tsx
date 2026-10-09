import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from 'eventual';

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Avatar size="sm"><AvatarFallback>AK</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>PS</AvatarFallback></Avatar>
    <Avatar size="lg"><AvatarFallback>RM</AvatarFallback></Avatar>
  </div>
);

export const Group = () => (
  <AvatarGroup>
    <Avatar><AvatarFallback>AK</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>PS</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>RM</AvatarFallback></Avatar>
    <AvatarGroupCount>+3</AvatarGroupCount>
  </AvatarGroup>
);
