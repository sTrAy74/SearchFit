import companiesData from "@/data/companies.json";
import type { Company } from "./types";

export const companies = companiesData as Company[];

export function getCompanies(): Company[] {
  return companies;
}

export function getCompanyById(id: string): Company | undefined {
  return companies.find((c) => c.id === id);
}
