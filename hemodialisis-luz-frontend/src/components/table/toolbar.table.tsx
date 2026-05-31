import type { Table } from "@tanstack/react-table";
import { DataTableColumnToggle } from "./toggle-columns.table";
interface DataTableToolbarProps<TData> {
    table: Table<TData>;
    extraContent?: React.ReactNode;
}

export function DataTableToolbar<TData>({
    extraContent,
    table,
}: DataTableToolbarProps<TData>) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">{extraContent}</div>
            <div className="shrink-0">
                <DataTableColumnToggle table={table} />
            </div>
        </div>
    );
}
