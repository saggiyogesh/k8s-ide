import type { KubeResource, ResourceCapabilities } from "@k8s-ide/core";

type Props = {
  resource: KubeResource;
  capabilities?: ResourceCapabilities;
  onDelete?: () => void;
  onScale?: () => void;
  onRestart?: () => void;
  onViewYaml?: () => void;
};

export function ActionBar({
  resource,
  capabilities,
  onDelete,
  onScale,
  onRestart,
  onViewYaml,
}: Props) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      <button className="k8s-button" onClick={onViewYaml}>
        View YAML
      </button>
      {capabilities?.canScale && (
        <button className="k8s-button" onClick={onScale}>
          Scale
        </button>
      )}
      {capabilities?.canRestart && (
        <button className="k8s-button" onClick={onRestart}>
          Restart rollout
        </button>
      )}
      {capabilities?.canDelete && (
        <button className="k8s-button" style={{ borderColor: "var(--danger)" }} onClick={onDelete}>
          Delete
        </button>
      )}
      <span className="k8s-muted" style={{ alignSelf: "center", marginLeft: "auto" }}>
        {resource.kind}/{resource.metadata.name}
      </span>
    </div>
  );
}
