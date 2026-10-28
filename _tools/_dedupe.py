import io
p = r"D:\DeepseekH\project\study-tracker\js\report.js"
lines = io.open(p, encoding="utf-8").read().split("\n")
idx = [i for i, l in enumerate(lines) if l.startswith("function roundRect(ctx, x, y, w, h, r) {")]
print("occurrences", idx)
if len(idx) > 1:
    start = idx[1]
    end = start
    while not lines[end].startswith("}"):
        end += 1
    # 连同其后空行
    del_end = end + 1
    while del_end < len(lines) and lines[del_end].strip() == "":
        del_end += 1
    # 保留一个空行分隔
    del lines[start:del_end]
    if start > 0 and lines[start-1].strip() != "":
        lines.insert(start, "")
    io.open(p, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print("removed duplicate at line", start + 1)
