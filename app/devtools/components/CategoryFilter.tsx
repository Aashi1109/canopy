"use client";
import { useTranslations } from "next-intl";

import { Select } from "@/components/ui/index.tsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface CategoryFilterOption {
  label: string;
  value: string;
}

export function CategoryFilter({ categories, value }: { categories: readonly CategoryFilterOption[]; value: string }) {
  const t = useTranslations("CatalogPage");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label={t("filterCategory")}
      className="h-10 w-56 bg-card"
      defaultValue={value}
      id="devtools-category-filter"
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("view", "all");
        if (event.currentTarget.value) {
          params.set("category", event.currentTarget.value);
        } else {
          params.delete("category");
        }
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    >
      <option value="">{t("allCategories")}</option>
      {categories.map((category) => (
        <option key={category.value} value={category.value}>
          {category.label}
        </option>
      ))}
    </Select>
  );
}
