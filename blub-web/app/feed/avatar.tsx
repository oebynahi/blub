export function Avatar({ name, id, avatar, size = "" }: {
  name: string; id?: string; avatar?: string | null; size?: string;
}) {
  return <span className={"avatar " + size} aria-hidden="true">
    {id && avatar ? <img src={"/api/blub?" + new URLSearchParams({ action: "avatar", id, v: avatar })} alt="" loading="lazy"/> : name.slice(0, 1).toUpperCase()}
  </span>;
}

export async function resizeAvatar(file: File): Promise<Blob> {
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024)
    throw Error("Choose a JPEG, PNG, or WebP up to 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 320;
    const side = Math.min(image.width, image.height);
    const context = canvas.getContext("2d");
    if (!context) throw Error("Couldn’t prepare the picture.");
    context.fillStyle = "#17191f";
    context.fillRect(0, 0, 320, 320);
    context.drawImage(image, (image.width - side)/2, (image.height - side)/2, side, side, 0, 0, 320, 320);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(Error("Couldn’t prepare the picture.")), "image/jpeg", .88));
  } finally { URL.revokeObjectURL(url); }
}
