from domain.entities.charge import Charge


class SheetsClient:
    async def sync_charges(self, spreadsheet_id: str, charges: list[Charge], access_token: str) -> dict:
        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
        except ImportError:
            raise ImportError("google-api-python-client and google-auth are required.")

        creds = Credentials(token=access_token)
        service = build("sheets", "v4", credentials=creds)

        # Group charges by month
        from collections import defaultdict
        by_month: dict[str, list[Charge]] = defaultdict(list)
        for charge in charges:
            month_key = charge.date.strftime("%Y-%m")
            by_month[month_key].append(charge)

        synced_count = 0
        for month_key, month_charges in by_month.items():
            sheet_name = self._month_tab_name(month_key)
            await self._ensure_sheet(service, spreadsheet_id, sheet_name)
            await self._write_charges(service, spreadsheet_id, sheet_name, month_charges)
            synced_count += len(month_charges)

        return {"synced": synced_count, "months": list(by_month.keys())}

    def _month_tab_name(self, month_key: str) -> str:
        from datetime import datetime
        dt = datetime.strptime(month_key, "%Y-%m")
        months_es = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                     "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
        return f"{months_es[dt.month - 1]} {dt.year}"

    async def _ensure_sheet(self, service, spreadsheet_id: str, sheet_name: str) -> None:
        spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        existing = [s["properties"]["title"] for s in spreadsheet.get("sheets", [])]
        if sheet_name not in existing:
            service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": [{"addSheet": {"properties": {"title": sheet_name}}}]},
            ).execute()

    async def _write_charges(self, service, spreadsheet_id: str, sheet_name: str, charges: list[Charge]) -> None:
        headers = [["Fecha", "Descripcion", "Monto", "Moneda", "Categoria", "Confirmado"]]
        rows = [
            [
                str(c.date),
                c.description,
                float(c.amount),
                c.currency,
                str(c.category_id) if c.category_id else "",
                "Si" if c.is_confirmed else "No",
            ]
            for c in charges
        ]
        values = headers + rows
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_name}!A1",
            valueInputOption="RAW",
            body={"values": values},
        ).execute()

    async def create_spreadsheet(self, title: str, access_token: str) -> dict:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials(token=access_token)
        service = build("sheets", "v4", credentials=creds)
        result = service.spreadsheets().create(
            body={"properties": {"title": title}}
        ).execute()
        return {
            "spreadsheet_id": result["spreadsheetId"],
            "spreadsheet_url": result["spreadsheetUrl"],
        }
