export interface IJobQueryFilters {
  searchTerm?: string;
  category?: string;
  organization?: string;
  district?: string;
  isFeatured?: boolean;
  closingSoon?: boolean;
  page?: number;
  limit?: number;
}
