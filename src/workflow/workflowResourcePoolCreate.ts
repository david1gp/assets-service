type WorkflowResource = "image" | "video" | "font" | "rclone" | "cleanup"

type WorkflowResourceLimits = Partial<Record<WorkflowResource, number>>

const defaultLimits: Record<WorkflowResource, number> = {
  image: 2,
  video: 1,
  font: 1,
  rclone: 1,
  cleanup: 1,
}

export const workflowResourcePoolCreate = (limits: WorkflowResourceLimits = {}) => {
  const capacities = new Map<WorkflowResource, number>()
  const active = new Map<WorkflowResource, number>()
  for (const resource of Object.keys(defaultLimits) as WorkflowResource[]) {
    const limit = limits[resource] ?? defaultLimits[resource]
    capacities.set(resource, Number.isInteger(limit) && limit > 0 ? limit : defaultLimits[resource])
    active.set(resource, 0)
  }

  const acquire = (resource: WorkflowResource): boolean => {
    const capacity = capacities.get(resource)
    const running = active.get(resource)
    if (capacity === undefined || running === undefined || running >= capacity) return false
    active.set(resource, running + 1)
    return true
  }

  const release = (resource: WorkflowResource): void => {
    const running = active.get(resource)
    if (running === undefined || running <= 0) return
    active.set(resource, running - 1)
  }

  return {
    acquire,
    release,
    activeCount: (resource: WorkflowResource): number => active.get(resource) ?? 0,
    capacity: (resource: WorkflowResource): number => capacities.get(resource) ?? 0,
  }
}
