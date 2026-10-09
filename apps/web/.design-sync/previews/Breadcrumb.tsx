import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from 'eventual';
export const Trail = () => (
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem><BreadcrumbLink href="#">Groups</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem><BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbLink href="#">Goa trip</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbPage>Beach shack lunch</BreadcrumbPage></BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
);
