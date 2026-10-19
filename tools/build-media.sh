#!/usr/bin/env bash
# Build the Windows audio runtime and its complete corresponding source package.
set -euo pipefail
root="$(pwd)"
work="$root/.tools/media-build"
prefix="$work/prefix"
out="$root/.tools/media-artifacts"
mkdir -p "$work/sources" "$prefix" "$out/runtime" "$out/corresponding-source"
cd "$work/sources"
curl --fail --location --retry 3 -o ffmpeg-9.0.2.tar.xz https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz
curl --fail --location --retry 3 -o lame-3.100.tar.gz https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz
printf '%s\n' '8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e  ffmpeg-9.0.2.tar.xz' 'ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e  lame-3.100.tar.gz' | sha256sum --check
cp ./*.tar.* "$out/corresponding-source/"
tar -xf lame-3.100.tar.gz
cd lame-3.100
./configure --host=x86_64-w64-mingw32 --prefix="$prefix" --disable-shared --enable-static --disable-frontend --disable-decoder CFLAGS='-O2 -fno-strict-aliasing'
make -j2
make install
cp COPYING "$out/runtime/LAME-LICENSE.txt"
cp config.log "$out/corresponding-source/LAME-config.log"
cd "$work/sources"
tar -xf ffmpeg-9.0.2.tar.xz
cd ffmpeg-9.0.2
export PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig"
./configure \
  --prefix="$prefix" --target-os=mingw32 --arch=x86_64 --cross-prefix=x86_64-w64-mingw32- --enable-cross-compile \
  --disable-everything --disable-autodetect --disable-network --disable-doc --disable-debug --disable-x86asm \
  --disable-gpl --disable-nonfree --disable-version3 --disable-shared --enable-static --disable-pthreads --enable-w32threads \
  --enable-ffmpeg --enable-avcodec --enable-avformat --enable-avfilter --enable-avdevice --enable-swresample \
  --enable-libmp3lame --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib -static -static-libgcc" \
  --enable-protocol=file,pipe --enable-indev=lavfi \
  --enable-demuxer=concat,mp3,wav,mov,matroska,ogg,flac,aac,aiff,asf,avi,mpegts,au \
  --enable-decoder=mp3,mp3float,aac,aac_fixed,aac_latm,flac,opus,vorbis,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s24be,pcm_s32le,pcm_s32be,pcm_u8,pcm_f32le,pcm_f64le,wmav1,wmav2,alac,adpcm_ima_wav,adpcm_ms \
  --enable-parser=mpegaudio,aac,aac_latm,flac,opus,vorbis \
  --enable-muxer=mp3,wav,null --enable-encoder=libmp3lame,pcm_s16le \
  --enable-filter=anullsrc,anull,aresample,asetrate,atempo,volume,aformat,atrim,asetpts,apad,concat,abuffer,abuffersink
make -j2
cp ffmpeg.exe "$out/runtime/ffmpeg.exe"
cp COPYING.LGPLv2.1 "$out/runtime/FFMPEG-LICENSE.txt"
cp ffbuild/config.log "$out/corresponding-source/FFmpeg-config.log"
cp config.h config_components.h "$out/corresponding-source/"
cp "$root/tools/build-media.sh" "$out/corresponding-source/"
cp "$root/.github/workflows/media-runtime.yml" "$out/corresponding-source/"
printf '%s\n' 'Fábula audio runtime: FFmpeg 9.0.2 and LAME 3.100.' 'Unmodified upstream sources; build commands are in build-media.sh.' 'No GPL-only or nonfree FFmpeg features, external network protocols or proprietary codecs are enabled.' 'FFmpeg is a separate command-line executable. Its source and build scripts accompany this release.' 'Sources: https://ffmpeg.org/releases/ and https://lame.sourceforge.io/.' > "$out/runtime/README.txt"
cp "$out/runtime/README.txt" "$out/corresponding-source/README.txt"
x86_64-w64-mingw32-gcc --version > "$out/corresponding-source/toolchain.txt"
dpkg-query -W >> "$out/corresponding-source/toolchain.txt"
x86_64-w64-mingw32-objdump -p ffmpeg.exe | grep 'DLL Name:' > "$out/runtime/imports.txt"
if grep -Eiv 'kernel32|msvcrt|ucrtbase|advapi32|bcrypt|user32|shell32|ole32|secur32|ws2_32|api-ms-win' "$out/runtime/imports.txt"; then
  echo 'Unexpected non-system runtime DLL. Review before distribution.' >&2
  exit 1
fi
cd "$out/runtime"
sha256sum ffmpeg.exe > ffmpeg.exe.sha256
zip -9 -r ../Fabula-Audio-Runtime.zip .
cd "$out"
tar -czf Fabula-Audio-Sources.tar.gz corresponding-source
sha256sum Fabula-Audio-Runtime.zip Fabula-Audio-Sources.tar.gz > SHA256SUMS.txt
