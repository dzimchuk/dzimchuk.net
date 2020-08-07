(function ($, undefined) {
    "use strict";

    var $document = $(document);

    $document.ready(function () {

        function updateLink(className, url){
            var link = $(className);
            link.removeClass('hidden');
            link.attr('href', url);
        }

        if (typeof github_url !== 'undefined') { updateLink('.social-github', github_url); }
        if (typeof linkedin_url !== 'undefined') { updateLink('.social-linkedin', linkedin_url); }

        var mainNav = document.querySelector('.main-nav');
        var headroom  = new Headroom(mainNav, {
            "offset": 0,
            "tolerance": {
            "up": 20,
            "down": 10
            }
        });
        headroom.init();

        $('.main-nav .nav-hamburger-open, .main-nav .nav-hamburger-close').on('click', function() {
            $('.main-nav').toggleClass('menu-opened');
        });
    });

})(jQuery);
