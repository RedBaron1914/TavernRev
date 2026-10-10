use ab_glyph::{Font, FontArc, PxScale, ScaleFont};
use base64::{engine::general_purpose, Engine as _};
use image::{codecs::png::PngEncoder, ColorType, GrayImage, ImageEncoder, Luma};
use std::sync::OnceLock;
use crate::visual_context::profiles::RenderProfile;

static FONT: OnceLock<FontArc> = OnceLock::new();

fn get_font() -> &'static FontArc {
    FONT.get_or_init(|| {
        let bytes = include_bytes!("../../fonts/JetBrainsMono-Regular.ttf");
        FontArc::try_from_slice(bytes).expect("Failed to parse embedded JetBrainsMono font")
    })
}

/// Word-wraps text by character columns, preserving explicit newlines and indentation.
pub fn wrap_text(text: &str, max_cols: usize) -> Vec<String> {
    let mut out = Vec::new();
    let max_cols = max_cols.max(10);

    for raw_line in text.lines() {
        if raw_line.trim().is_empty() {
            out.push(String::new());
            continue;
        }

        // Preserve leading indentation (spaces and tabs expanded to 4 spaces)
        let mut leading_indent = String::new();
        let mut rest_of_line = "";
        let mut found_non_ws = false;
        for (idx, ch) in raw_line.char_indices() {
            if ch == ' ' {
                leading_indent.push(' ');
            } else if ch == '\t' {
                leading_indent.push_str("    ");
            } else {
                found_non_ws = true;
                rest_of_line = &raw_line[idx..];
                break;
            }
        }

        if !found_non_ws {
            out.push(String::new());
            continue;
        }

        let mut current_line = leading_indent.clone();
        let mut current_len = leading_indent.chars().count();
        let base_indent_len = current_len;

        for word in rest_of_line.split_whitespace() {
            let word_len = word.chars().count();

            if current_len == base_indent_len {
                if current_len + word_len <= max_cols {
                    current_line.push_str(word);
                    current_len += word_len;
                } else if word_len <= max_cols {
                    if base_indent_len > 0 {
                        out.push(current_line);
                        current_line = word.to_string();
                        current_len = word_len;
                    } else {
                        current_line.push_str(word);
                        current_len += word_len;
                    }
                } else {
                    // Split long word across lines
                    let mut chunk = String::new();
                    let mut chunk_len = current_len;
                    for ch in word.chars() {
                        chunk.push(ch);
                        chunk_len += 1;
                        if chunk_len >= max_cols {
                            current_line.push_str(&chunk);
                            out.push(current_line);
                            current_line = String::new();
                            chunk = String::new();
                            chunk_len = 0;
                        }
                    }
                    if !chunk.is_empty() {
                        current_line.push_str(&chunk);
                        current_len = chunk_len;
                    }
                }
            } else if current_len + 1 + word_len <= max_cols {
                current_line.push(' ');
                current_line.push_str(word);
                current_len += 1 + word_len;
            } else {
                out.push(current_line);
                current_line = String::new();
                if word_len <= max_cols {
                    current_line.push_str(word);
                    current_len = word_len;
                } else {
                    let mut chunk = String::new();
                    let mut chunk_len = 0;
                    for ch in word.chars() {
                        chunk.push(ch);
                        chunk_len += 1;
                        if chunk_len >= max_cols {
                            out.push(chunk);
                            chunk = String::new();
                            chunk_len = 0;
                        }
                    }
                    if !chunk.is_empty() {
                        current_line = chunk;
                        current_len = chunk_len;
                    }
                }
            }
        }

        if !current_line.is_empty() {
            out.push(current_line);
        }
    }

    if out.is_empty() {
        out.push(String::new());
    }

    out
}

/// Splits wrapped lines into chunks of at most `max_lines` per page.
pub fn split_into_pages(lines: &[String], max_lines: usize) -> Vec<Vec<String>> {
    let max_lines = max_lines.max(1);
    let mut pages = Vec::new();
    let mut cur = Vec::new();

    for line in lines {
        if cur.len() >= max_lines {
            pages.push(cur);
            cur = Vec::new();
        }
        cur.push(line.clone());
    }

    if !cur.is_empty() {
        pages.push(cur);
    }

    if pages.is_empty() {
        pages.push(vec![String::new()]);
    }

    pages
}

/// Renders a list of lines into a single grayscale PNG and returns it as a Base64 data URI.
pub fn render_page_to_png(lines: &[String], profile: &RenderProfile) -> Result<String, String> {
    let font = get_font();
    let scale = PxScale::from(profile.font_size);
    let scaled_font = font.as_scaled(scale);

    let line_height = scaled_font.height().ceil() as u32 + 3;
    let ascent = scaled_font.ascent().ceil() as f32;

    // Calculate canvas dimensions
    let mut max_line_width = 0.0f32;
    for line in lines {
        let mut width = 0.0f32;
        for ch in line.chars() {
            let glyph = scaled_font.scaled_glyph(ch);
            width += scaled_font.h_advance(glyph.id);
        }
        if width > max_line_width {
            max_line_width = width;
        }
    }

    // Shrink canvas to content width, with a sensible minimum (320px)
    // Clamp to 1568px (Anthropic's maximum dimension ceiling) to prevent server-side downscaling blur
    let content_width = (max_line_width.ceil() as u32) + (profile.pad_x * 2);
    let width = content_width.max(320).min(1568);

    let content_height = (lines.len() as u32 * line_height) + (profile.pad_y * 2);
    let height = content_height.min(profile.max_height_px).max(64);

    // Create 8-bit grayscale canvas with white background (255)
    let mut canvas = GrayImage::from_pixel(width, height, Luma([255]));

    let mut y = profile.pad_y as f32;

    for line in lines {
        if y + line_height as f32 > (height - profile.pad_y) as f32 {
            break;
        }

        let mut x = profile.pad_x as f32;

        for ch in line.chars() {
            let mut glyph = scaled_font.scaled_glyph(ch);
            glyph.position = ab_glyph::point(x, y + ascent);
            let advance = scaled_font.h_advance(glyph.id);

            if let Some(outlined) = font.outline_glyph(glyph) {
                let bounds = outlined.px_bounds();
                outlined.draw(|gx, gy, coverage| {
                    let px = bounds.min.x as i32 + gx as i32;
                    let py = bounds.min.y as i32 + gy as i32;

                    if px >= 0 && px < width as i32 && py >= 0 && py < height as i32 {
                        let current = canvas.get_pixel(px as u32, py as u32).0[0];
                        // Blend black ink (0) on white paper (255) based on antialiasing coverage
                        let ink = ((1.0 - coverage) * 255.0).clamp(0.0, 255.0) as u8;
                        let blended = current.min(ink);
                        canvas.put_pixel(px as u32, py as u32, Luma([blended]));
                    }
                });
            }

            x += advance;
        }

        y += line_height as f32;
    }

    // Encode to PNG bytes
    let mut png_bytes = Vec::new();
    let encoder = PngEncoder::new(&mut png_bytes);
    encoder
        .write_image(
            canvas.as_raw(),
            width,
            height,
            ColorType::L8,
        )
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    // Base64 encode
    let b64 = general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Renders entire text into 1 or more PNG images (data URIs).
pub fn render_text_to_images(text: &str, profile: &RenderProfile) -> Result<Vec<String>, String> {
    let wrapped = wrap_text(text, profile.cols);

    let font = get_font();
    let scale = PxScale::from(profile.font_size);
    let scaled_font = font.as_scaled(scale);
    let line_height = scaled_font.height().ceil() as u32 + 3;

    let available_height = profile.max_height_px.saturating_sub(profile.pad_y * 2);
    let max_lines_per_page = (available_height / line_height).max(1) as usize;

    // First page has full capacity; continuation pages reserve 1 line for the "--- Page X ---" header
    // to prevent dropping the final line due to canvas height clamping
    let max_lines_first = max_lines_per_page;
    let max_lines_subsequent = max_lines_per_page.saturating_sub(1).max(1);

    let mut pages = Vec::new();
    let mut cur = Vec::new();
    let mut is_first = true;

    for line in wrapped {
        let limit = if is_first { max_lines_first } else { max_lines_subsequent };
        if cur.len() >= limit {
            pages.push(cur);
            cur = Vec::new();
            is_first = false;
        }
        cur.push(line);
    }
    if !cur.is_empty() {
        pages.push(cur);
    }
    if pages.is_empty() {
        pages.push(vec![String::new()]);
    }

    let mut out_images = Vec::new();

    for (page_idx, page_lines) in pages.into_iter().enumerate() {
        if out_images.len() >= profile.max_images_cap {
            break;
        }

        let mut lines_with_header = page_lines;
        if page_idx > 0 {
            lines_with_header.insert(0, format!("--- Page {} ---", page_idx + 1));
        }

        let data_uri = render_page_to_png(&lines_with_header, profile)?;
        out_images.push(data_uri);
    }

    Ok(out_images)
}
