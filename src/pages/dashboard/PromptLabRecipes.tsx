import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, Archive, Trash2, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { listRecipes, updateRecipe, deleteRecipe, type LabRecipe } from "@/lib/recipesApi";

const PromptLabRecipes = () => {
  const [recipes, setRecipes] = useState<LabRecipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function reload() {
    try {
      const r = await listRecipes();
      setRecipes(r.recipes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <Link to="/dashboard/development/prompt-lab" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <span className="label text-muted-foreground">— Prompt Lab</span>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Recipe library</h2>
        </div>
      </div>

      {error && <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {recipes === null ? (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No recipes yet. Rate a Lab iteration 5 and click &quot;Promote to recipe&quot; on the iteration card.
        </div>
      ) : (
        <div className="space-y-3">
          {recipes.map((r) => (
            <RecipeRow
              key={r.id}
              recipe={r}
              isEditing={editing === r.id}
              onEdit={() => setEditing(r.id)}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                reload();
              }}
              onDeleted={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function RecipeRow({
  recipe,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
  onDeleted,
}: {
  recipe: LabRecipe;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [archetype, setArchetype] = useState(recipe.archetype);
  const [tmpl, setTmpl] = useState(recipe.prompt_template);

  async function save() {
    await updateRecipe(recipe.id, { archetype, prompt_template: tmpl });
    onSaved();
  }

  async function archive() {
    await updateRecipe(recipe.id, { status: "archived" });
    onDeleted();
  }

  async function remove() {
    if (!confirm("Permanently delete this recipe?")) return;
    await deleteRecipe(recipe.id);
    onDeleted();
  }

  if (isEditing) {
    return (
      <div className="border border-border bg-background p-5 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Archetype</label>
          <Input value={archetype} onChange={(e) => setArchetype(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Prompt template</label>
          <Textarea value={tmpl} onChange={(e) => setTmpl(e.target.value)} className="mt-1 min-h-[80px] font-mono text-xs" />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{recipe.archetype}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider">{recipe.room_type}</span>
            <span className="rounded bg-foreground/10 px-2 py-0.5 text-[10px] uppercase tracking-wider">{recipe.camera_movement}</span>
            {recipe.provider && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider">{recipe.provider}</span>
            )}
            <span className="text-xs text-muted-foreground">
              applied {recipe.times_applied}×
              {recipe.rating_at_promotion && <> · promoted at {recipe.rating_at_promotion}★</>}
            </span>
          </div>
          <p className="mt-3 font-mono text-sm leading-relaxed">{recipe.prompt_template}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
          <button onClick={onEdit} className="hover:text-foreground" title="Edit"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={archive} className="hover:text-foreground" title="Archive"><Archive className="h-3.5 w-3.5" /></button>
          <button onClick={remove} className="hover:text-destructive" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

export default PromptLabRecipes;
