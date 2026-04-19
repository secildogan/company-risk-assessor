import type { DirectorsData, SourceQuery } from "../types";
import { chFetch } from "./companiesHouseClient";

interface OfficerItem {
  name: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
  links?: { officer?: { appointments?: string } };
}

export async function fetchDirectors(
  query: SourceQuery & { registrationNumber: string },
): Promise<DirectorsData> {
  console.log(`[${new Date().toISOString()}] directors: start`, query.registrationNumber);

  const data = await chFetch<{ items?: OfficerItem[] }>(
    "directors",
    `/company/${encodeURIComponent(query.registrationNumber)}/officers`,
  );

  const officers = (data.items ?? []).filter((o) =>
    (o.officer_role ?? "").toLowerCase().includes("director"),
  );

  const directors = await Promise.all(
    officers.map(async (o) => {
      let otherActive = 0;
      const appointmentsPath = o.links?.officer?.appointments;
      if (appointmentsPath) {
        try {
          const apts = await chFetch<{
            items?: Array<{
              resigned_on?: string;
              appointed_to?: { company_number?: string };
            }>;
          }>("directors", appointmentsPath);
          otherActive = (apts.items ?? []).filter(
            (a) =>
              !a.resigned_on &&
              a.appointed_to?.company_number !== query.registrationNumber,
          ).length;
        } catch (e) {
          console.warn(
            `[${new Date().toISOString()}] directors: appointments failed for ${o.name}`,
            e,
          );
        }
      }
      return {
        name: o.name,
        appointedDate: o.appointed_on ?? null,
        resignedDate: o.resigned_on ?? null,
        otherActiveAppointments: otherActive,
      };
    }),
  );

  console.log(
    `[${new Date().toISOString()}] directors: finish`,
    `${directors.length} directors`,
  );
  return { directors };
}
