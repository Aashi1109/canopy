"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/utils.ts";
import { SelectionHighlight } from "./SelectionHighlight.tsx";

type SortableItemState = ReturnType<typeof useSortable>;

export type OrderableItemState = Pick<SortableItemState, "attributes" | "listeners" | "setActivatorNodeRef"> & {
  disabled: boolean;
  isDragging: boolean;
};

type OrderableListProps<Item> = {
  animateSelection?: boolean;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  dragSurface?: "handle" | "card";
  getId: (item: Item) => string;
  getLabel?: (item: Item) => string;
  items: readonly Item[];
  layout?: "grid" | "vertical";
  onReorder: (items: Item[]) => void;
  renderItem: (item: Item, state: OrderableItemState) => ReactNode;
  selectedId?: string;
};

function OrderableItem<Item>({
  disabled,
  id,
  item,
  renderItem,
  selected,
}: {
  disabled: boolean;
  id: string;
  item: Item;
  renderItem: OrderableListProps<Item>["renderItem"];
  selected?: boolean;
}) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({
    disabled,
    id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <li
      className={cn(
        "relative",
        selected !== undefined && "rounded-lg border",
        selected !== undefined && (selected ? "border-primary bg-accent" : "border-transparent"),
      )}
      data-selected={selected}
      ref={setNodeRef}
      style={style}
    >
      {renderItem(item, {
        attributes,
        disabled,
        isDragging,
        listeners,
        setActivatorNodeRef,
      })}
    </li>
  );
}

export function OrderableList<Item>({
  animateSelection = false,
  ariaLabel,
  className,
  disabled = false,
  dragSurface = "handle",
  getId,
  getLabel,
  items,
  layout = "vertical",
  onReorder,
  renderItem,
  selectedId,
}: OrderableListProps<Item>) {
  const [isDragging, setIsDragging] = useState(false);
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } });
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } });
  const keyboard = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  const sensors = useSensors(
    dragSurface === "card" ? mouse : pointer,
    dragSurface === "card" ? touch : undefined,
    keyboard,
  );
  const ids = items.map(getId);
  const labels = new Map(
    items.map((item) => {
      const id = getId(item);
      return [id, getLabel?.(item) ?? id];
    }),
  );

  function itemLabel(id: string | number) {
    return labels.get(String(id)) ?? String(id);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setIsDragging(false);
    if (!over || active.id === over.id) return;
    const previousIndex = ids.indexOf(String(active.id));
    const nextIndex = ids.indexOf(String(over.id));
    if (previousIndex === -1 || nextIndex === -1) return;
    onReorder(arrayMove([...items], previousIndex, nextIndex));
  }

  const list = (
    <ul
      aria-label={ariaLabel}
      className={cn(
        animateSelection &&
          "data-[selection-highlight-ready=true]:[&>[data-selected=true]]:border-transparent data-[selection-highlight-ready=true]:[&>[data-selected=true]]:bg-transparent",
        className,
      )}
    >
      {items.map((item) => {
        const id = getId(item);
        return (
          <OrderableItem
            disabled={disabled}
            id={id}
            item={item}
            key={id}
            renderItem={renderItem}
            selected={selectedId === undefined ? undefined : selectedId === id}
          />
        );
      })}
    </ul>
  );

  return (
    <DndContext
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${itemLabel(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${itemLabel(active.id)} is over position ${ids.indexOf(String(over.id)) + 1} of ${ids.length}.`
              : `${itemLabel(active.id)} is no longer over a valid position.`,
          onDragEnd: ({ active, over }) =>
            over
              ? `Dropped ${itemLabel(active.id)} at position ${ids.indexOf(String(over.id)) + 1} of ${ids.length}.`
              : `Dropped ${itemLabel(active.id)}. Its position did not change.`,
          onDragCancel: ({ active }) =>
            `Reordering canceled. ${itemLabel(active.id)} returned to its original position.`,
        },
      }}
      collisionDetection={closestCenter}
      onDragCancel={() => setIsDragging(false)}
      onDragEnd={handleDragEnd}
      onDragStart={() => setIsDragging(true)}
      sensors={sensors}
    >
      <SortableContext items={ids} strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
        {animateSelection ? (
          <SelectionHighlight asChild activeSelector=":scope > [data-selected='true']" disabled={isDragging}>
            {list}
          </SelectionHighlight>
        ) : (
          list
        )}
      </SortableContext>
    </DndContext>
  );
}
