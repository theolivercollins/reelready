import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listClients, type Client } from "@/lib/clientsApi";

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const data = await listClients();
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between">
        <div>
          <span className="label text-muted-foreground">— Custom Listings</span>
          <h2 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-[-0.02em]">
            <Users className="h-6 w-6 text-muted-foreground" />
            Clients
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Each client is a Sierra Interactive site you publish custom listing landing pages to.
          </p>
        </div>
        <Button onClick={() => navigate("/dashboard/clients/new")}>
          <Plus className="mr-2 h-4 w-4" /> Add New Client
        </Button>
      </div>

      {error && (
        <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {clients && clients.length === 0 && !loading && (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No clients yet. Add one to start publishing custom listing pages.
        </div>
      )}

      {clients && clients.length > 0 && (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sierra URL</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/dashboard/clients/${client.id}`)}
                >
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <a
                      href={client.sierra_public_base_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {client.sierra_public_base_url}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(client.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
