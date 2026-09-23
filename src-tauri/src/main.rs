// Estää konsoli-ikkunan avautumisen Windowsissa julkaisukäännöksessä.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mettistool_lib::run()
}
