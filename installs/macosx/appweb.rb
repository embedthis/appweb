class Appweb < Formula
  homepage "https://www.embedthis.com/appweb"
  sha1 "2367c53bd181f29270ecf0321b8344b2ed49fa9d"

  # version "6.2.1"

  depends_on 'makeme'

  def install
    ENV.deparallelize
    ENV.prepend_path "PATH", "/usr/local/bin"
    system "me", "configure", "--release", "--prefix", "app=#{HOMEBREW_PREFIX}/Cellar/#{name}"
    system "me", "compile", "install"
  end

  test do
    system "#{bin}/appweb"
  end
end
