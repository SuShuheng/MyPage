import { setIcon } from "obsidian";

export interface IconProps {
  name: string;
  className?: string;
}

export function Icon({ name, className = "" }: IconProps) {
  return (
    <span
      class={`mypage-icon ${className}`.trim()}
      aria-hidden="true"
      ref={(element) => {
        if (element) setIcon(element, name);
      }}
    />
  );
}
